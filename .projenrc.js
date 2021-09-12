const { AwsCdkTypeScriptApp } = require('projen');
const project = new AwsCdkTypeScriptApp({
  author: 'Kim jinyoung',
  authorAddress: 'jingood2@gmail.com',
  cdkVersion: '1.121.0',
  defaultReleaseBranch: 'main',
  name: 'cdk-web-serivce-pattern',
  repository: 'https://github.com/jingood2/cdk-web-service-pattern',

  cdkDependencies: [
    '@aws-cdk/aws-certificatemanager',
    '@aws-cdk/aws-ec2',
    '@aws-cdk/aws-ecs',
    '@aws-cdk/aws-ecr',
    '@aws-cdk/aws-ecs-patterns',
    '@aws-cdk/aws-route53',
    '@aws-cdk/aws-elasticloadbalancingv2',
    '@aws-cdk/aws-iam',
    '@aws-cdk/aws-logs',
    '@aws-cdk/aws-rds',
    '@aws-cdk/aws-secretsmanager',
    '@aws-cdk/aws-servicediscovery',
    '@aws-cdk/core',
  ], /* Which AWS CDK modules (those that start with "@aws-cdk/") this app uses. */
  // deps: [],                          /* Runtime dependencies of this module. */
  // description: undefined,            /* The description is just a string that helps people understand the purpose of the package. */
  // devDeps: [],                       /* Build dependencies for this module. */
  // packageName: undefined,            /* The "name" in package.json. */
  // projectType: ProjectType.UNKNOWN,  /* Which type of project this is (library/app). */
  // releaseWorkflow: undefined,        /* Define a GitHub workflow for releasing from "main" when new versions are bumped. */
});
project.synth();