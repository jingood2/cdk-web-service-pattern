import * as ecs from '@aws-cdk/aws-ecs';
import * as elbv2 from '@aws-cdk/aws-elasticloadbalancingv2';
import * as servicediscovery from '@aws-cdk/aws-servicediscovery';
import * as cdk from '@aws-cdk/core';
import {
  EcsContainerExtension,
  EcsContainerExtensionProps,
} from './ecs-container-extension';
import { EnsureMysqlDatabaseExtension } from './ensure-mysql-database-extension';
import { EnsurePostgresqlDatabaseExtension } from './ensure-postgresql-database-extension';
import { DatabaseVendor } from '../utils';

/**
 * A Ecs task definition.
 */
export interface IEcsTaskDefinition {
  /** The Ecs container extension */
  readonly ecsContainerExtension: EcsContainerExtension;

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
 * Props for `EcsFargateTaskDefinition`
 */
export interface EcsFargateTaskDefinitionProps extends ecs.FargateTaskDefinitionProps {
  /** Ecs configuration */
  readonly containerInfo?: EcsContainerExtensionProps;
}

/**
 * The details of a Ecs task definition running on Fargate.
 */
export class EcsFargateTaskDefinition extends ecs.FargateTaskDefinition implements IEcsTaskDefinition {
  public readonly ecsContainerExtension: EcsContainerExtension;

  constructor(scope: cdk.Construct, id: string, props?: EcsFargateTaskDefinitionProps) {
    super(scope, id, props);
    this.ecsContainerExtension = configureContainerOnTaskDefinition(this, props?.containerInfo);
  }

  /** @inheritDoc */
  public useCloudMapService(cloudMapService: servicediscovery.IService): void {
    this.ecsContainerExtension.useCloudMapService(cloudMapService);
  }

  /** @inheritDoc */
  public configureHealthCheck(targetGroup: elbv2.ApplicationTargetGroup): void {
    this.ecsContainerExtension.configureHealthCheck(targetGroup);
  }
}

/**
 * Props for `EcsEc2TaskDefinition`
 */
export interface EcsEc2TaskDefinitionProps extends ecs.Ec2TaskDefinitionProps {
  /** Ecs configuration */
  readonly containerInfo?: EcsContainerExtensionProps;
}

/**
 * The details of a Ecs task definition running on EC2.
 */
export class EcsEc2TaskDefinition extends ecs.Ec2TaskDefinition implements IEcsTaskDefinition {
  public readonly ecsContainerExtension: EcsContainerExtension;

  constructor(scope: cdk.Construct, id: string, props?: EcsEc2TaskDefinitionProps) {
    const networkMode = props?.networkMode ?? ecs.NetworkMode.AWS_VPC;

    if (networkMode !== ecs.NetworkMode.AWS_VPC) {
      throw new Error('Only VPC networking mode is supported at the moment.');
    }

    super(scope, id, {
      ...props,
      networkMode,
    });

    this.ecsContainerExtension = configureContainerOnTaskDefinition(this, props?.containerInfo);
  }

  /** @inheritDoc */
  public useCloudMapService(cloudMapService: servicediscovery.IService): void {
    this.ecsContainerExtension.useCloudMapService(cloudMapService);
  }

  /** @inheritDoc */
  public configureHealthCheck(targetGroup: elbv2.ApplicationTargetGroup): void {
    this.ecsContainerExtension.configureHealthCheck(targetGroup);
  }
}

/**
 * Configures container on a task definition.
 * @internal
 */
export function configureContainerOnTaskDefinition(task: ecs.TaskDefinition, container?: EcsContainerExtensionProps) {
  const extension = new EcsContainerExtension(container);
  task.addExtension(extension);

  if (container?.databaseCredentials && extension.databaseVendor === DatabaseVendor.MYSQL) {
    task.addExtension(
      new EnsureMysqlDatabaseExtension({
        databaseName: extension.databaseName,
        databaseCredentials: container.databaseCredentials,
      }));
  } else if (container?.databaseCredentials && extension.databaseVendor === DatabaseVendor.POSTGRES) {
    task.addExtension(
      new EnsurePostgresqlDatabaseExtension({
        databaseName: extension.databaseName,
        databaseCredentials: container.databaseCredentials,
      }));
  }

  return extension;
}