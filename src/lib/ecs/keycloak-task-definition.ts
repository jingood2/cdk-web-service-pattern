import * as ecs from '@aws-cdk/aws-ecs';
import * as elbv2 from '@aws-cdk/aws-elasticloadbalancingv2';
import * as servicediscovery from '@aws-cdk/aws-servicediscovery';
import * as cdk from '@aws-cdk/core';
import { EnsureMysqlDatabaseExtension } from './ensure-mysql-database-extension';
import { EnsurePostgresqlDatabaseExtension } from './ensure-postgresql-database-extension';
import {
  KeycloakContainerExtension,
  KeycloakContainerExtensionProps,
} from './keycloak-container-extension';
import { DatabaseVendor } from '../utils';

/**
 * A Keycloak task definition.
 */
export interface IKeycloakTaskDefinition {
  /** The Keycloak container extension */
  readonly keycloakContainerExtension: KeycloakContainerExtension;

  /**
   * Register the task definition with a cloudmap service.
   */
  useCloudMapService(cloudMapService: servicediscovery.IService): void;

  /**
   * Configures the health check of the application target group.
   */
  configureHealthCheck(targetGroup: elbv2.ApplicationTargetGroup): void;
}

/**
 * Props for `KeycloakFargateTaskDefinition`
 */
export interface KeycloakFargateTaskDefinitionProps extends ecs.FargateTaskDefinitionProps {
  /** Keycloak configuration */
  readonly keycloak?: KeycloakContainerExtensionProps;
}

/**
 * The details of a Keycloak task definition running on Fargate.
 */
export class KeycloakFargateTaskDefinition extends ecs.FargateTaskDefinition implements IKeycloakTaskDefinition {
  public readonly keycloakContainerExtension: KeycloakContainerExtension;

  constructor(scope: cdk.Construct, id: string, props?: KeycloakFargateTaskDefinitionProps) {
    super(scope, id, props);
    this.keycloakContainerExtension = configureKeyCloak(this, props?.keycloak);
  }

  /** @inheritDoc */
  public useCloudMapService(cloudMapService: servicediscovery.IService): void {
    this.keycloakContainerExtension.useCloudMapService(cloudMapService);
  }

  /** @inheritDoc */
  public configureHealthCheck(targetGroup: elbv2.ApplicationTargetGroup): void {
    this.keycloakContainerExtension.configureHealthCheck(targetGroup);
  }
}

/**
 * Props for `KeycloakEc2TaskDefinition`
 */
export interface KeycloakEc2TaskDefinitionProps extends ecs.Ec2TaskDefinitionProps {
  /** Keycloak configuration */
  readonly keycloak?: KeycloakContainerExtensionProps;
}

/**
 * The details of a Keycloak task definition running on EC2.
 */
export class KeycloakEc2TaskDefinition extends ecs.Ec2TaskDefinition implements IKeycloakTaskDefinition {
  public readonly keycloakContainerExtension: KeycloakContainerExtension;

  constructor(scope: cdk.Construct, id: string, props?: KeycloakEc2TaskDefinitionProps) {
    const networkMode = props?.networkMode ?? ecs.NetworkMode.AWS_VPC;

    if (networkMode !== ecs.NetworkMode.AWS_VPC) {
      throw new Error('Only VPC networking mode is supported at the moment.');
    }

    super(scope, id, {
      ...props,
      networkMode,
    });

    this.keycloakContainerExtension = configureKeyCloak(this, props?.keycloak);
  }

  /** @inheritDoc */
  public useCloudMapService(cloudMapService: servicediscovery.IService): void {
    this.keycloakContainerExtension.useCloudMapService(cloudMapService);
  }

  /** @inheritDoc */
  public configureHealthCheck(targetGroup: elbv2.ApplicationTargetGroup): void {
    this.keycloakContainerExtension.configureHealthCheck(targetGroup);
  }
}

/**
 * Configures keycloak on a task definition.
 * @internal
 */
export function configureKeyCloak(task: ecs.TaskDefinition, keycloak?: KeycloakContainerExtensionProps) {
  const extension = new KeycloakContainerExtension(keycloak);
  task.addExtension(extension);

  if (keycloak?.databaseCredentials && extension.databaseVendor === DatabaseVendor.MYSQL) {
    task.addExtension(
      new EnsureMysqlDatabaseExtension({
        databaseName: extension.databaseName,
        databaseCredentials: keycloak.databaseCredentials,
      }));
  } else if (keycloak?.databaseCredentials && extension.databaseVendor === DatabaseVendor.POSTGRES) {
    task.addExtension(
      new EnsurePostgresqlDatabaseExtension({
        databaseName: extension.databaseName,
        databaseCredentials: keycloak.databaseCredentials,
      }));
  }

  return extension;
}