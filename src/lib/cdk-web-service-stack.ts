//import * as ec2 from '@aws-cdk/aws-ec2';
//import * as ecs from '@aws-cdk/aws-ecs';
import * as elbv2 from '@aws-cdk/aws-elasticloadbalancingv2';
//import * as discovery from '@aws-cdk/aws-servicediscovery';
import * as cdk from '@aws-cdk/core';
import * as app from './ecs/index';
import { CloudMapNamespaceProvider, PortPublisher, VpcProvider } from './utils';

export interface CdkWebServiceStackProps extends cdk.StackProps {

}

export class CdkWebServiceStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props: CdkWebServiceStackProps) {
    super(scope, id, props);


    const vpcProvider = VpcProvider.ingressAndPrivateVpc();
    const vpcInfo = vpcProvider._provideVpcInfo(this);
    // VPC
    /* const vpc = ec2.Vpc.fromLookup(this, 'Vpc', {
      vpcId: '',
    }); */

    /* const cluster = new ecs.Cluster(this, 'Cluster', {
      vpc: vpc,
      defaultCloudMapNamespace: {
        name: this.stackName,
        type: discovery.NamespaceType.DNS_PRIVATE,
        vpc: vpc,
      },
    });

    const cfnCluster = cluster.node.defaultChild as any as ecs.CfnCluster;
    cfnCluster.capacityProviders = ['FARGATE', 'FARGATE_SPOT'];
    cfnCluster.defaultCapacityProviderStrategy = [
      {
        capacityProvider: 'FARGATE_SPOT',
        weight: 2,
      },
      {
        capacityProvider: 'FARGATE',
        weight: 1,
      },
    ]; */

    // ALB
    const loadbalancer = new elbv2.ApplicationLoadBalancer(this, 'ALB', {
      vpc: vpcInfo.vpc,
      internetFacing: true,
    });

    new cdk.CfnOutput(this, 'AlbAddress', {
      value: cdk.Fn.sub('http://${Name}', {
        Name: loadbalancer.loadBalancerDnsName,
      }),
    });

    const listener = loadbalancer.addListener('http', {
      protocol: elbv2.ApplicationProtocol.HTTP,
      defaultAction: elbv2.ListenerAction.fixedResponse(404, {
        contentType: 'text/plain',
        messageBody: 'Page cannot be found',
      }),
      open: true,
    });

    new app.CdkEcsCluster(this, 'App', {
      cpu: 512,
      memoryLimitMiB: 1024,
      // Service options
      minHealthyPercent: 50,
      maxHealthyPercent: 200,
      vpcProvider: VpcProvider.fromVpc( vpcInfo.vpc ),
      ecsClusterProvider: app.ClusterProvider.fargateSpotCluster(),
      cloudMapNamespaceProvider: CloudMapNamespaceProvider.privateDns({ name: 'sk-awstf.internal' }),
      capacityProviderStrategy: [
        {
          capacityProvider: 'FARGATE_SPOT',
          weight: 100,
        },
        {
          capacityProvider: 'FARGATE',
          weight: 1,
        },
      ],
      httpPortPublisher: PortPublisher.addTarget({
        // Your load balancer listener
        listener,
        conditions: [elbv2.ListenerCondition.pathPatterns([
          '/*',
        ])],
        priority: 1000,
      }),
    });
  }
}