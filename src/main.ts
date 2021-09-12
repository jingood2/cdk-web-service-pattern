import { App, Construct, Stack, StackProps } from '@aws-cdk/core';
import { CdkWebServiceStack } from './lib/cdk-web-service-stack';

export class MyStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps = {}) {
    super(scope, id, props);

    // define resources here...
  }
}

// for development, use account/region from cdk cli
const devEnv = {
  //account: process.env.CDK_DEFAULT_ACCOUNT,
  //region: process.env.CDK_DEFAULT_REGION,
  account: '037729278610',
  region: 'ap-northeast-2',
};

const app = new App();

//new MyStack(app, 'my-stack-dev', { env: devEnv });
new CdkWebServiceStack(app, 'AwsTF', { env: devEnv });

app.synth();