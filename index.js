import * as aws from "@pulumi/aws";
//import { RdsDbInstance } from "@pulumi/aws/opsworks";
import * as pulumi from "@pulumi/pulumi";
const config = new pulumi.Config();
const webAppConfig = new pulumi.Config("webApp");
const db_dialect = new pulumi.Config("db_dialect");
const mysql_port = new pulumi.Config("mysql_port");
//const mailgun_api_key = new pulumi.Config("mailgun_api_key");
const mailgun_api_key = config.require("mailgun_api_key");
//const domainName = new pulumi.Config("domainName");
import * as gcp from "@pulumi/gcp";

const certificateArn = config.require("certificateArn");

// Retrieve the value of keyName from pulumi.yaml
const keyPairName = webAppConfig.get("keyPairName");
const domainName = webAppConfig.get("Arecord");


domainName: "networkstructures.pro";

console.log(`The keyName is: ${keyPairName}`);

// Create a new VPC
const vpc = new aws.ec2.Vpc("webappVPC", {
  cidrBlock: config.get("cidrBlock"),
});
console.log(vpc.id);

// Create a Google Cloud Storage bucket
const bucket = new gcp.storage.Bucket("my-storage-bucket", {
  name: "vidish_cloud_bucket",
  location: "US",
  project: "devproject-406403",
  
  });
  
// Create an SNS topic
const snsTopic = new aws.sns.Topic("my-sns-topic");

// Create an IAM role for the Lambda function
const lambdaRole = new aws.iam.Role("lambdaRole", {
  assumeRolePolicy: JSON.stringify({
      Version: "2012-10-17",
      Statement: [{
          Action: "sts:AssumeRole",
          Effect: "Allow",
          Principal: {
              Service: "lambda.amazonaws.com",
          },
      }],
  }),
});


const lambdaRolesPolicyArn = [
  "arn:aws:iam::aws:policy/CloudWatchLogsFullAccess",
  "arn:aws:iam::aws:policy/AmazonS3FullAccess",
  "arn:aws:iam::aws:policy/AWSLambda_FullAccess",
  "arn:aws:iam::aws:policy/AmazonDynamoDBFullAccess",
];

// Attach the AWSLambdaBasicExecutionRole policy to the IAM role
const lambdaFullAccessPolicyAttachment = new aws.iam.RolePolicyAttachment("lambdaBasicExecutionPolicy", {
  policyArn: "arn:aws:iam::aws:policy/AmazonDynamoDBFullAccess",
  role: lambdaRole.name,
});


  const cloudWatchLogsFullAccessAttachment = new aws.iam.RolePolicyAttachment(
    "lambdaPolicy-CloudWatchLogs",
    {
      role: lambdaRole.name,
      policyArn: "arn:aws:iam::aws:policy/CloudWatchLogsFullAccess",
    }
  );

  const s3bucketFullAccessAttachment = new aws.iam.RolePolicyAttachment(
    "lambdaPolicy-S3FullAccess",
    {
      role: lambdaRole.name,
      policyArn: "arn:aws:iam::aws:policy/AmazonS3FullAccess",
    }
  );

  const dynamoDBFullAccessAttachment = new aws.iam.RolePolicyAttachment(
    "lambdaPolicy-DynamoDBFullAccess",
    {
      role: lambdaRole.name,
      policyArn: "arn:aws:iam::aws:policy/AmazonDynamoDBFullAccess",
    }
  );

  const EC2TopicAccessPolicy = new aws.iam.Policy("EC2TopicAccessPolicy", {
    policy: {
      Version: "2012-10-17",
      Statement: [
        {
          Sid: "AllowEC2ToPublishToSNSTopic",
          Effect: "Allow",
          Action: ["sns:Publish", "sns:CreateTopic"],
          Resource: snsTopic.arn,
        },
      ],
    },
    roles: [lambdaRole],
  });

// Create a Google Service Account
const serviceAccount = new gcp.serviceaccount.Account("my-service-account", {
  accountId: "my-service-account",
  displayName: "My Service Account",
  project: "devproject-406403",
});



// IAM binding
  const bucketIamBinding = new gcp.storage.BucketIAMBinding("binding", {
  bucket: bucket.name,
  project: "devproject", // Replace with your specific project name
  role: "roles/storage.admin",
  members: [pulumi.interpolate`serviceAccount:${serviceAccount.email}`],
  });
  


// Create Access Keys for the Service Account
const key = new gcp.serviceaccount.Key("my-service-account-key", {
  serviceAccountId: serviceAccount.name,
  account: serviceAccount.name,
  keyAlgorithm: "KEY_ALG_RSA_2048",
});



// Create a DynamoDB table
const dynamoDBTable = new aws.dynamodb.Table("dynamoDBTable", {
  name: "Csye6225_Demo_DynamoDB",
  attributes: [
    {
      name: "id",
      type: "S",
    },
    {
      name: "status",
      type: "S",
    },
    {
      name: "timestamp",
      type: "S",
    },
  ],
  hashKey: "id",
  rangeKey: "status",
  readCapacity: 5,
  writeCapacity: 5,
  globalSecondaryIndexes: [
    {
      name: "TimestampIndex",
      hashKey: "timestamp",
      rangeKey: "id",
      projectionType: "ALL",
      readCapacity: 5,
      writeCapacity: 5,
    },
  ],
});

// Create an IAM policy for DynamoDB access
const dynamoDBPolicy = new aws.iam.Policy("DynamoDBAccessPolicy", {
  policy: {
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Action: [
          "dynamodb:PutItem",
          "dynamodb:GetItem",
          "dynamodb:Query", // Add other necessary actions
        ],
        Resource: dynamoDBTable.arn,
      },
    ],
  },
});


// Attach the DynamoDB policy to the Lambda execution role
const dynamoDBPolicyAttachment = new aws.iam.RolePolicyAttachment("DynamoDBPolicyAttachment", {
  policyArn: dynamoDBPolicy.arn,
  role: lambdaRole.name,
});

// Create a Lambda function
const lambdaFunction = new aws.lambda.Function("my-lambda-function", {
  runtime: 'nodejs18.x',
  handler: "index.handler",
  packageType: 'Zip',
   
  code: new pulumi.asset.AssetArchive({
      ".": new pulumi.asset.FileArchive("/Users/vidis/Documents/folder1/serverless"),
  }),
  timeout:60,
  role: lambdaRole.arn,
  environment: {
      variables: {
          // Adding environment variables 
      //    snsTopic: snsTopic.arn,
          mailgun_api_key: mailgun_api_key,
          key: key.privateKey,  //google service account key
          domainName: domainName,
          bucket: bucket.name,
          dynamoDBTable: dynamoDBTable.name,

      },
  },

});

// Subscribe Lambda function to SNS topic
const snsSubscription = new aws.sns.TopicSubscription("my-sns-subscription", {
  protocol: "lambda",
  endpoint: lambdaFunction.arn,
  topic: snsTopic.arn,
  });


new aws.iam.PolicyAttachment("topicPolicyAttachment", {
  policyArn: EC2TopicAccessPolicy.arn,
  roles: [lambdaRole.name],
});


// Grant permissions for Lambda to be invoked by SNS
const lambdaPermission = new aws.lambda.Permission("my-lambda-permission", {
  action: "lambda:InvokeFunction",
  function: lambdaFunction,
  principal: "sns.amazonaws.com",
  sourceArn: snsTopic.arn,
});


  // Create an Internet Gateway and attach it to the VPC
  const ig = new aws.ec2.InternetGateway("webapp-ig", {
    vpcId: vpc.id,
  });

const publicSubnetsArray=[];
const privateSubnetsArray=[];

aws.getAvailabilityZones({ state: "available" }).then((response) => {
  const allZones = response.names;

  //  number of subnets to create based on the number of availability zones
  const numSubnetsToCreate = Math.min(3, allZones.length);

  const selectedZones = allZones.slice(0, numSubnetsToCreate);

  selectedZones.forEach((zone, i) => {
      // Create public subnet
      const publicSubnet = new aws.ec2.Subnet(`webapp-public-subnet-${i + 1}`, {
          vpcId: vpc.id,
          cidrBlock: `10.0.${i * 2}.0/24`,
          availabilityZone: zone,
          mapPublicIpOnLaunch: true,
          tags: {
              Name: `webapp-public-subnet-${i + 1}`,
          },
      });
      publicSubnetsArray.push(publicSubnet);

      // Create private subnet
      const privateSubnet = new aws.ec2.Subnet(`webapp-private-subnet-${i + 1}`, {
          vpcId: vpc.id,
          cidrBlock: `10.0.${i * 2 + 1}.0/24`,
          availabilityZone: zone,
          tags: {
              Name: `webapp-private-subnet-${i + 1}`,
          },
      });
      privateSubnetsArray.push(privateSubnet);
  });


      
  // Create route table
  const publicrouteTable = new aws.ec2.RouteTable(`webapp-Public-routeTable`, {
      vpcId: vpc.id,
      });

  const privateRouteTable = new aws.ec2.RouteTable("webapp-private-routeTable", {
      vpcId: vpc.id,
      });
  
  // Associate the public subnets with the public route table
  privateSubnetsArray.forEach((subnet, i) => {
      new aws.ec2.RouteTableAssociation(`private-association-${i}`, {
          subnetId: subnet.id,
          routeTableId: privateRouteTable.id,
      });

  });
              
  // Associate the private subnets with the private route table
  publicSubnetsArray.forEach((subnet, i) => {
      new aws.ec2.RouteTableAssociation(`public-association-${i}`, {
          subnetId: subnet.id,
          routeTableId: publicrouteTable.id,
      });
  
      // Create a public route in the public route table with the destination CIDR block 0.0.0.0/0 and the internet gateway
      const publicRoute = new aws.ec2.Route(`publicRoute-${i}`, {
          routeTableId: publicrouteTable.id,
          destinationCidrBlock: "0.0.0.0/0",
          gatewayId: ig.id,
      });
  });

  // Create an IAM role
  const ec2Role = new aws.iam.Role("EC2Role", {
    assumeRolePolicy: JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Action: "sts:AssumeRole",
          Effect: "Allow",
          Principal: {
            Service: "ec2.amazonaws.com",
          },
        },
      ],
    }),
  });


    // Attach the CloudWatchAgentServerPolicy to the IAM role
    const cloudWatchAgentServerPolicyAttachment =
    new aws.iam.RolePolicyAttachment("CloudWatchAgentServerPolicyAttachment", {
      policyArn: "arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy",
      role: ec2Role.name,
    });

      // Create an instance profile and associate the IAM role with it
  const instanceProfile = new aws.iam.InstanceProfile("EC2InstanceProfile", {
    role: ec2Role.name,
  });


  // Create a security group for the load balancer
  const loadBalancerSecurityGroup = new aws.ec2.SecurityGroup(
    "loadBalancerSecurityGroup",
    {
      vpcId: vpc.id,
      ingress: [
        {
          protocol: "tcp",
          fromPort: 80,
          toPort: 80,
          cidrBlocks: ["0.0.0.0/0"], // Allow TCP traffic on port 80 from anywhere
        },
        {
          protocol: "tcp",
          fromPort: 443,
          toPort: 443,
          cidrBlocks: ["0.0.0.0/0"], // Allow TCP traffic on port 443 from anywhere
        },
      ],
      egress: [
        {
          protocol: "-1", // -1 means all protocols
          fromPort: 0,
          toPort: 0, // Set both fromPort and toPort to 0 to allow all ports
          cidrBlocks: ["0.0.0.0/0"],
        },
      ],
    }
  );

  const EC2SGroup = new aws.ec2.SecurityGroup("webAppSecurityGroup", {
    vpcId: vpc.id,
    ingress: [
      {
        protocol: "tcp",
        fromPort: 3000, // for web application port
        toPort: 3000,
        securityGroups: [loadBalancerSecurityGroup.id],
        //cidrBlocks: ["0.0.0.0/0"],
      },
      {
        protocol: "tcp", // for ssh
        fromPort: 22,
        toPort: 22,
        //cidrBlocks: ["0.0.0.0/0"],
        securityGroups: [loadBalancerSecurityGroup.id],
      },
    ],
    egress: [
      {
        protocol: "-1", // -1 means all protocols
        fromPort: 0,
        toPort: 0, // Set both fromPort and toPort to 0 to allow all ports
        cidrBlocks: ["0.0.0.0/0"],
      },
    ],
  });


  const dbSecurityGroup = new aws.ec2.SecurityGroup("dbsecgrup", {
    vpcId: vpc.id,
    ingress: [
      {
        protocol: "tcp",
        fromPort: 3306, // for web application port
        toPort: 3306,
        securityGroups:[EC2SGroup.id]
      },
    ],
    egress: [
      {
        protocol: "-1", // -1 means all protocols
        fromPort: 0,
        toPort: 0, // Set both fromPort and toPort to 0 to allow all ports
        cidrBlocks: ["0.0.0.0/0"],
      },
    ],
  });

  // Create DB parameter group
  const dbParamGroup = new aws.rds.ParameterGroup("db-param-group", {
    name: "cloud-assign6-params-group0",
    family: "mysql8.0", // or postgresql9.6, etc
    description: "Custom parameters for my RDS instance",
    max_user_connections: 100,
    parameter: [
      {
        name: "character_set_server",
        value: "utf8",
      },
      {
        name: "collation_server",
        value: "utf8_general_ci",
      },
    ],
  });

  // Create db subnet group
  const dbSubnetGroup = new aws.rds.SubnetGroup("db-subnet-group", {
    subnetIds: privateSubnetsArray,
 //   subnetIds: subnetDetails.id,
  });

  // Create RDS instance
  const dbInstance = new aws.rds.Instance("db-instance", {
    engine: "mysql",
    instanceClass: "db.t2.micro",
    dbSubnetGroupName: dbSubnetGroup.name,
    parameterGroupName: dbParamGroup.name,
    allocatedStorage: 20,
    multiAz: false,
    dbInstanceIdentifier: "csye6225",
    username: "csye6225",
    password: new pulumi.secret("Vidish111"),

    publiclyAccessible: false,
    dbName: "csye6225",
    skipFinalSnapshot: true,
    vpcSecurityGroupIds: [dbSecurityGroup.id],
  });

  const DB_HOST = pulumi.interpolate`${dbInstance.address}`;
//userData
const userData = pulumi.interpolate`#!/bin/bash
   
# Define the path to the .env file
envFile="/opt/csye6225/webapp/.env"
 
# Check if the .env file exists
if [ -e "$envFile" ]; then
  # If it exists, remove it
  sudo rm "$envFile"
fi
 
# Create the .env file
sudo touch "$envFile"

echo "snsTopic='${snsTopic.arn}'" | sudo tee -a "$envFile"

echo "MYSQL_DB='${dbInstance.dbName}'" | sudo tee -a "$envFile"
echo "MYSQL_HOST='${DB_HOST}'" | sudo tee -a "$envFile"
echo "MYSQL_USER='${dbInstance.username}'" | sudo tee -a "$envFile"
echo "MYSQL_PASSWORD ='${dbInstance.password}'" | sudo tee -a "$envFile"
echo "MYSQL_PORT='3306'" | sudo tee -a "$envFile"
echo "DB_DIALECT='mysql'" | sudo tee -a "$envFile"
"sudo chown -R csye6225:csye6225 /opt/aws/webapp"
sudo systemctl enable unit
sudo systemctl start unit
sudo systemctl restart unit 

`;

const base64UserData = Buffer.from(userData).toString("base64");
console.log(base64UserData);



const snsPublishPolicy = new aws.iam.Policy("SNSPublishPolicy", {
  policy: {
      Version: "2012-10-17",
      Statement: [{
          Effect: "Allow",
          Action: "sns:Publish",
          Resource: snsTopic.arn,
      }],
  },
  roles: [ec2Role.name],
});

const snsPublishPolicyAttachment = new aws.iam.RolePolicyAttachment("SNSPublishPolicyAttachment", {
  role: ec2Role.name,
  policyArn: snsPublishPolicy.arn,
});

// const latestAmi = aws.ec2.getAmi({
//   owners: ["amazon"],
//   mostRecent: true,
//   filters: [
//     { name: "name", values: ["amzn2-ami-hvm-*-x86_64-gp2"] },
//     { name: "root-device-type", values: ["ebs"] },
//     { name: "architecture", values: ["x86_64"] },
//   ],
// });

const launchtemplate = new aws.ec2.LaunchTemplate("launchtemplate", {
  name: "asg_launch_config",

 // imageId: "ami-0c93ddecad8641284",
//  imageId: "ami-07c3f79345556bd16",
//  imageId: "ami-06234cdb3fae99f2a",
//  imageId: "ami-00e08101c81dd234f",

  imageId: "ami-0eb480833d06f0aff",
// imageId: latestAmi.id,

  instanceType: "t2.micro",
  keyName: keyPairName, 
  disableApiTermination: false,
  dependsOn: [dbInstance],
  iamInstanceProfile: {
    name: instanceProfile.name,
  },
  blockDeviceMappings: [
    {
      deviceName: "/dev/xvda",
      ebs: {
        deleteOnTermination: true,
        volumeSize: 25,
        volumeType: "gp2",
      },
    },
  ],
  networkInterfaces: [
    {
      associatePublicIpAddress: true,
      deleteOnTermination: true,
      securityGroups: [EC2SGroup.id], 
    },
  ],
  tagSpecifications: [
    {
      resourceType: "instance",
      tags: {
        Name: "asg_launch_config",
      },
    },
  ],
  userData: userData.apply((data) => Buffer.from(data).toString("base64")),
});

 // Create a Load Balancer
 const loadBalancer = new aws.lb.LoadBalancer("webAppLB", {
  name: "csye6225-lb",
  internal: false,
  loadBalancerType: "application",
  securityGroups: [loadBalancerSecurityGroup.id],
  subnets: publicSubnetsArray,
  enableDeletionProtection: false,
  tags: {
    Application: "WebApp",
  },
},{dependsOn: [launchtemplate]});


  // Create a Target Group
  const targetGroup = new aws.lb.TargetGroup("webAppTargetGroup", {
    name: "csye6225-lb-tg",
    port: 3000,
    protocol: "HTTP",
    vpcId: vpc.id,
    targetType: "instance",
    healthCheck: {
      enabled: true,
      path: "/healthz",
      port: "3000",
      protocol: "HTTP",
      healthyThreshold: 2,
      unhealthyThreshold: 2,
      timeout: 6,
      interval: 30,
    },
  });

      // Create a Listener
      const listener = new aws.lb.Listener("webAppListener", {
        loadBalancerArn: loadBalancer.arn,
        port: 443,
        protocol: "HTTPS",
        defaultActions: [
          {
            type: "forward",
            targetGroupArn: targetGroup.arn,
          },
        ],
        certificateArn: certificateArn,
      },{dependsOn: [targetGroup]});


        // Create an Auto Scaling Group
  const asg = new aws.autoscaling.Group("asg", {
    name: "asg_launch_config",
    maxSize: 3,
    minSize: 1,
    desiredCapacity: 1,
    forceDelete: true,
    defaultCooldown: 60,
    vpcZoneIdentifiers: publicSubnetsArray,
    instanceProfile: instanceProfile.name,
    healthCheckGracePeriod: 300,
    tags: [
      {
        key: "Name",
        value: "asg_launch_config",
        propagateAtLaunch: true,
      },
    ],
    launchTemplate: {
      id: launchtemplate.id,
      version: "$Latest",
    },
    dependsOn: [targetGroup],
    targetGroupArns: [targetGroup.arn],

  });
  

  // Create Scaling Policies
  const scaleUpPolicy = new aws.autoscaling.Policy("scaleUpPolicy", {
    autoscalingGroupName: asg.name,
    scalingAdjustment: 1,
    cooldown: 60,
    adjustmentType: "ChangeInCapacity",
    autocreationCooldown: 60,
    cooldownDescription: "Scale up policy when average CPU usage is above 5%",
    policyType: "SimpleScaling",
    scalingTargetId: asg.id,
  });

  const scaleDownPolicy = new aws.autoscaling.Policy("scaleDownPolicy", {
    autoscalingGroupName: asg.name,
    scalingAdjustment: -1,
    cooldown: 60,
    adjustmentType: "ChangeInCapacity",
    autocreationCooldown: 60,
    cooldownDescription: "Scale down policy when average CPU usage is below 3%",
    policyType: "SimpleScaling",
    scalingTargetId: asg.id,
  });

  const cpuUtilizationAlarmHigh = new aws.cloudwatch.MetricAlarm(
    "cpuUtilizationAlarmHigh",

    {
      comparisonOperator: "GreaterThanThreshold",

      evaluationPeriods: 1,

      metricName: "CPUUtilization",

      namespace: "AWS/EC2",

      period: 60,

      threshold: 5,

      statistic: "Average",

      alarmActions: [scaleUpPolicy.arn],

      dimensions: { AutoScalingGroupName: asg.name },
    }
  );

  const cpuUtilizationAlarmLow = new aws.cloudwatch.MetricAlarm(
    "cpuUtilizationAlarmLow",

    {
      comparisonOperator: "LessThanThreshold",

      evaluationPeriods: 1,

      metricName: "CPUUtilization",

      namespace: "AWS/EC2",

      period: 60,

      threshold: 3,

      statistic: "Average",

      alarmActions: [scaleDownPolicy.arn],

      dimensions: { AutoScalingGroupName: asg.name },
    }
  );
  
  const hostedZoneName = "demo.networksturcture.pro"; 
  const aRecordName = "networkstructures.pro"; 

  const zonePromise = aws.route53.getZone(
    { name: domainName },
    { async: true }
  );
  
  const hostedZone = aws.route53.getZone({ name: domainName });
  console.log(
    "53 records the loadbalancer",
    loadBalancer,
    loadBalancer.dnsName
  );


  //route 53
  new aws.route53.Record(`Arecord`, {
    name: domainName,
    type: "A",
    zoneId: hostedZone.then((zone) => zone.zoneId),
    aliases: [
      {
        name: loadBalancer.dnsName,
        zoneId: loadBalancer.zoneId,
        evaluateTargetHealth: true,
      },
    ],
  });
});

/*

const role = new aws.iam.Role("snsPublishRole", {
  assumeRolePolicy: JSON.stringify({
      Version: "2012-10-17",
      Statement: [{
          Action: "sts:AssumeRole",
          Effect: "Allow",
          Principal: {
              Service: "sns.amazonaws.com",
          },
      }],
  }),
});

*/

export const lambdaRoleName = lambdaRole.name;


// Create a Google Cloud Storage bucket
// const bucket = new gcp.storage.Bucket("my-storage-bucket", {
//   name: "vidish_cloud_bucket",
//   location: "US",
//   project: "devproject-406403",

// });

// export const bucketName = bucket.name;
// export const serviceAccountEmail = serviceAccount.email;
// export const privateKey = key.privateKey;




// Attach the DynamoDB policy to the Lambda execution role
// const dynamoDBPolicyAttachment = new aws.iam.PolicyAttachment(
//   "DynamoDBPolicyAttachment",
//   {
//     policyArn: dynamoDBPolicy.arn,
//     role: [lambdaRole.name], // Assuming lambdaRole is the execution role for your Lambda function
//     dependsOn: [dynamoDBTable],
//   }
// );




// Export the SNS topic ARN for reference
//export const snsTopicArn = snsTopic.arn;


/*
// Create an IAM role for CloudWatch Agent
const cloudWatchAgentRole = new aws.iam.Role("cloudWatchAgentRole", {
    assumeRolePolicy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [{
            Action: "sts:AssumeRole",
            Effect: "Allow",
            Principal: {
                Service: "ec2.amazonaws.com",
            },
        }],
    }),
});

// Attach the AWS-managed policy for CloudWatch Agent to the IAM role
const cloudWatchAgentPolicyAttachment = new aws.iam.RolePolicyAttachment("cloudWatchAgentPolicyAttachment", {
    policyArn: "arn:aws:iam::aws:policy/service-role/AmazonEC2RoleforSSM",
    role: lambdaRole.name,
  //  lambdaRole: cloudWatchAgentRole.name,
});

export const cloudWatchAgentRoleName = cloudWatchAgentRole.name;

*/




// Example of attaching additional policies if needed
// const additionalPolicyAttachment = new aws.iam.PolicyAttachment("AdditionalPolicyAttachment", {
//     policyArn: "arn:aws:iam::aws:policy/AdditionalPolicyName",
//     roles: [ec2Role.name],
// });

// Create an instance profile and associate the IAM role with it
// const instanceProfile = new aws.iam.InstanceProfile("EC2InstanceProfile", {
//     role: ec2Role.name,
// });

// Export the IAM role name for future reference
// export const ec2RoleName = ec2Role.name;

// Export the IAM role name for use with EC2 instances
// const cloudWatchAgentRoleName = cloudWatchAgentRole.name;

/*
// EC2 instance 
  const applicationEc2Instance= new aws.ec2.Instance("appEC2Instance", {
  instanceType: "t2.micro", // creating the ec2 instance
  vpcSecurityGroupIds: [EC2SGroup.id],     
//    ami: "ami-0306fc5041ea82cf1",
 //   ami: "ami-0de928fbd7cb11826",
    //ami: "ami-0248c05e71db9e318",
    ami:"ami-04baf520d3c9a874b",
    subnetId: subnetDetails[0].id, // Choosing the first subnet for the instance
    associatePublicIpAddress: true,
    rootBlockDevice: {

    volumeSize: 25,
    volumeType: "gp2",
    deleteOnTermination: true,
  },



  keyName: webAppConfig.get("keyPairName"),
  disableApiTermination: false,
  tags: {
    Name: "app-instance",
  },
  userData:base64UserData,

  iamInstanceProfile {name: instanceProfile.name},

})

*/
//  zonePromise.then(zone=>{
//    const aRecord = new aws.route53.Record("a-record", {
//      name: config.require('Arecord'),
//      type: "A",
//      zoneId: zone.zoneId,
//      records: [loadBalancer.publicIp],
//      ttl: 60,

//  },
//     {dependsOn: [loadBalancer]}
//  );
//  });

//});

// export const vpcId = vpc.id;
