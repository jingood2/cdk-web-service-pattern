import * as ecs from '@aws-cdk/aws-ecs';
//import * as ecr from '@aws-cdk/aws-ecr';
import * as elbv2 from '@aws-cdk/aws-elasticloadbalancingv2';
import * as logs from '@aws-cdk/aws-logs';
import * as secretsmanager from '@aws-cdk/aws-secretsmanager';
import * as cloudmap from '@aws-cdk/aws-servicediscovery';
import * as cdk from '@aws-cdk/core';
import { DatabaseVendor } from '../utils/database-provider';

/**
 * Configuration for the ECS Container.
 */
export interface EcsContainerExtensionProps {
  /**
   * Ecs container image to use.
   * @default - use jboss/container from docker hub.
   */
  readonly image?: ecs.ContainerImage;

  /**
   * A name for the container added to the task definition.
   * @default 'container'
   */
  readonly containerName?: string;

  /**
   * Secrets manager secret containing the RDS database credentials and
   * connection information in JSON format.
   * @default - none
   */
  readonly databaseCredentials?: secretsmanager.ISecret;

  /**
   * Database name
   * @default 'container'
   */
  readonly databaseName?: string;

  /**
   * Database schema
   * @default - for Postgresql, the default is 'public'
   */
  readonly databaseSchema?: string;

  /**
   * The database vendor.
   * @default EcsDatabaseVendor.H2
   */
  readonly databaseVendor?: DatabaseVendor;

  /**
   * Default admin user. This user is created in the master realm if it doesn't exist.
   * @default 'admin'
   */
  readonly defaultAdminUser?: string;

  /**
   * Default admin user's password. This password is applied when the default admin user
   * is created.
   * @default 'admin'
   */
  readonly defaultAdminPassword?: string;

  /**
   * Memory limit of the container task.
   * @default 1024
   */
  readonly memoryLimitMiB?: number;

  /**
   * Memory reservation size for the container task.
   * @default - 80% of memoryLimitMiB
   */
  readonly memoryReservationMiB?: number;

  /**
   * Log driver for the task.
   * @default - cloudwatch with one month retention
   */
  readonly logging?: ecs.LogDriver;
}

/**
 * Adds a container container to a task definition. To use ECS service discovery
 * to locate cluster members, you need to call `useCloudMapService` with the
 * CloudMap service so that we can configure the correct DNS query.
 */
export class EcsContainerExtension implements ecs.ITaskDefinitionExtension {
  /**
   * Name of the container added to the task definition.
   */
  public readonly containerName: string;

  /**
   * Name of the Ecs database.
   */
  public readonly databaseName: string;

  /**
   * Database vendor.
   */
  public readonly databaseVendor: DatabaseVendor;

  /**
   * The default admin user's name.
   */
  public readonly defaultAdminUser: string;

  /**
   * The default admin user password.
   */
  public readonly defaultAdminPassword: string;

  /**
   * Web traffic port.
   */
  public readonly webPort: number = 8080;

  /**
   * Web traffic port with HTTPS
   */
  public readonly httpsWebPort: number = 8443;

  /**
   * Admin console port.
   */
  public readonly adminConsolePort: number = 9990;

  // Privates
  private readonly _memoryLimitMiB?: number;
  private readonly _memoryReservationMiB?: number;
  private readonly _logging: ecs.LogDriver;
  private readonly _databaseCredentials?: secretsmanager.ISecret;
  private readonly _image: ecs.ContainerImage;
  private _cloudMapService?: cloudmap.IService;
  private readonly _databaseSchema?: string;

  constructor(props?: EcsContainerExtensionProps) {
    this._image = props?.image ?? ecs.ContainerImage.fromRegistry('gazgeek/springboot-helloworld');

    this.containerName = props?.containerName ?? 'container';
    this.databaseVendor = props?.databaseVendor ?? DatabaseVendor.H2;
    this.databaseName = props?.databaseName ?? 'container';
    this._databaseSchema = props?.databaseSchema;
    this._databaseCredentials = props?.databaseCredentials;
    this.defaultAdminUser = props?.defaultAdminUser ?? 'admin';
    this.defaultAdminPassword = props?.defaultAdminPassword ?? 'admin';

    this._memoryLimitMiB = props?.memoryLimitMiB;
    this._memoryReservationMiB = props?.memoryReservationMiB;

    this._logging = props?.logging ?? ecs.LogDriver.awsLogs({
      streamPrefix: '/cdk-ecs-prefix',
      logRetention: logs.RetentionDays.ONE_MONTH,
    });

    if (!isSupportedDatabaseVendor(this.databaseVendor)) {
      throw new Error(`The ${this.databaseVendor} engine is not yet tested and fully supported. Please submit a PR.`);
    }

    if (!this._databaseCredentials && this.databaseVendor !== DatabaseVendor.H2) {
      throw new Error(`The ${this.databaseVendor} database vendor requires credentials`);
    }
  }

  /**
   * Inform container of a CloudMap service discovery mechanism.
   */
  useCloudMapService(serviceDiscovery: cloudmap.IService) {
    this._cloudMapService = serviceDiscovery;
  }

  public _getServiceDiscoveryProperties() {
    if (!this._cloudMapService) {
      return '';
    }

    // Note: SRV-based discovery isn't enough to handle bridged-mode networking.
    // - Keycloak wants two ports for clustering in either stack mode
    // - CloudMap currently supports only one service registry per ecs service
    //
    // To the reader: Got any suggestions? Open a PR. I'd love to run this on
    // EC2 with bridged networking so that keycloak can be run in containers on
    // bursting instance types where vpc trunking is not available.
    return cdk.Fn.sub('dns_query=${ServiceName}.${ServiceNamespace},dns_record_type=${QueryType}', {
      ServiceName: this._cloudMapService.serviceName,
      ServiceNamespace: this._cloudMapService.namespace.namespaceName,
      QueryType: cloudmap.DnsRecordType.A,
    });
  }

  /**
   * @inheritDoc
   */
  extend(taskDefinition: ecs.TaskDefinition): void {
    const containerSecrets: Record<string, ecs.Secret> = {};

    const databaseNameForVendor = this.databaseVendor != DatabaseVendor.H2 ? this.databaseName : '';

    let containerMemoryLimit: number;
    if (this._memoryLimitMiB) {
      containerMemoryLimit = this._memoryLimitMiB;
    } else if (taskDefinition.isFargateCompatible && !this._memoryLimitMiB) {
      const cfnTaskDefinition = taskDefinition.node.defaultChild as ecs.CfnTaskDefinition;
      containerMemoryLimit = parseInt(cfnTaskDefinition.memory!);
    } else {
      containerMemoryLimit = 512;
    }

    // User-specified memory reservation, otherwise 80% of the memory limit.
    let containerMemoryReservation = this._memoryReservationMiB ?? Math.round(containerMemoryLimit * 0.8);

    if (this._databaseCredentials) {
      containerSecrets.DB_ADDR = ecs.Secret.fromSecretsManager(this._databaseCredentials, 'host');
      containerSecrets.DB_PORT = ecs.Secret.fromSecretsManager(this._databaseCredentials, 'port');
      containerSecrets.DB_USER = ecs.Secret.fromSecretsManager(this._databaseCredentials, 'username');
      containerSecrets.DB_PASSWORD = ecs.Secret.fromSecretsManager(this._databaseCredentials, 'password');
    }

    const container = taskDefinition.addContainer(this.containerName, {
      image: this._image,
      environment: {
        DB_USER: this.defaultAdminUser,
        DB_PASSWORD: this.defaultAdminPassword,
        DB_VENDOR: this.databaseVendor,
        DB_NAME: databaseNameForVendor,
        DB_SCHEMA: this._databaseSchema ?? '',
        JDBC_PARAMS: 'useSSL=false',
        JAVA_OPTS: '-Djboss.bind.address.management=0.0.0.0',
      },
      secrets: containerSecrets,
      logging: this._logging,
      memoryLimitMiB: containerMemoryLimit,
      memoryReservationMiB: containerMemoryReservation,
    });


    container.addPortMappings({ containerPort: this.webPort }); // Web port
    container.addPortMappings({ containerPort: this.httpsWebPort }); // HTTPS web port
    container.addPortMappings({ containerPort: this.adminConsolePort }); // Admin console port
  }

  /**
   * Configure health checks on the target group.
   * @param targetGroup
   */
  public configureHealthCheck(targetGroup: elbv2.ApplicationTargetGroup) {
    targetGroup.configureHealthCheck({
      path: '/health',
      enabled: true,
    });
  }
}

/**
 * Checks if the given database vendor is supported by this construct.
 * @internal
 */
export function isSupportedDatabaseVendor(databaseVendor: DatabaseVendor) {
  switch (databaseVendor) {
    case DatabaseVendor.H2:
    case DatabaseVendor.MYSQL:
    case DatabaseVendor.POSTGRES:
      return true;

    default:
      return false;
  }
}