import * as aws from "@pulumi/aws";
//import { RdsDbInstance } from "@pulumi/aws/opsworks";
import * as pulumi from "@pulumi/pulumi";
const config= new pulumi.Config();
const webAppConfig=  new pulumi.Config("webApp");
const db_dialect = new pulumi.Config("db_dialect");
const mysql_port = new pulumi.Config("mysql_port");


// Retrieve the value of keyName from pulumi.yaml
const keyPairName = webAppConfig.get("keyName");

// Now you can use keyName in your code
console.log(`The keyName is: ${keyPairName}`);

// Create a new VPC
const vpc = new aws.ec2.Vpc("webappVPC", {
  cidrBlock:config.get("cidrBlock") 
  
});
console.log (vpc.id)
// Variable to hold subnet details

aws.getAvailabilityZones({ state: "available" }).then((response) => { 
const subnetDetails = [];
const publicSubnetIds = [];
const privateSubnetIds = [];
console.log(response.names)
  if (response.names.length > 2){
console.log (vpc.id) 
    const zones = response.names.slice(0, 3);

    let priv_zone = true;

    for (let i = 0; i < 6; i++) {
        const subnet = new aws.ec2.Subnet(`subnet${i}`, {
        vpcId: vpc.id,
        cidrBlock: `10.0.${i}.0/24`,
        availabilityZone: `${zones[Math.floor(i / 2)]}`,
        tags: {
            Name: `webapp-subnet${i}`,
            Type: priv_zone ? "public" : "private",
        },
    
        });
        if (priv_zone) {
          privateSubnetIds.push(subnet.id);
          } else {
          publicSubnetIds.push(subnet.id);
          }

        priv_zone=!priv_zone;
        subnetDetails.push(subnet);
    }

  }else{
    const zones = response.names.slice(0, 2);
    for(let i = 0; i < 4; i++) {
        const subnet = new aws.ec2.Subnet(`subnet${i}`, {
        vpcId: vpc.id,
        cidrBlock: `10.0.${i}.0/24`,
        availabilityZone: `${ i < 2 ? zones[0]: zones[1]}`,
        tags: {
            Name: `webapp-subnet${i}`,
            Type: [0,2].includes(i) ? "public" : "private",
        },
    
        });
        if ([1,3].includes[i]) {
           privateSubnetIds.push(subnet.id);
           } else {
           publicSubnetIds.push(subnet.id);
           }
          priv_zone = ! priv_zone;
      //     subnetDetails.push(subnet);

        subnetDetails.push(subnet);
    }
  }
  

  // Create an Internet Gateway and attach it to the VPC
  const ig = new aws.ec2.InternetGateway("webapp-ig", {
    vpcId: vpc.id,
  });

  // Create the public route table
  const publicRouteTable = new aws.ec2.RouteTable("webapp-publicRouteTable", {
    vpcId: vpc.id,
  });

  // Create the private route table
  const privateRouteTable = new aws.ec2.RouteTable("webapp-privateRouteTable", {
    vpcId: vpc.id,
  });

  // Loop through the created subnets and add the public ones to the public route table and private ones to the private route table
  for (let i = 0; i < subnetDetails.length; i++) {
    const routeTableAssociation = new aws.ec2.RouteTableAssociation(
      `webapp-routeTableAssociation${i}`,
      {
        subnetId: subnetDetails[i].id,
        routeTableId: i %2 == 0 ? publicRouteTable.id : privateRouteTable.id,
      }
    );
  }


  // Create a public route
  const publicRoute = new aws.ec2.Route("webapp-publicRoute", {
    routeTableId: publicRouteTable.id,
    destinationCidrBlock: webAppConfig.get("destinationCidrBlock"),
    gatewayId: ig.id,
  });

  // Create a security group for the load balancer
const loadBalancerSecurityGroup = new aws.ec2.SecurityGroup("loadBalancerSecurityGroup", {
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
        }
    ]
  });

  
  const EC2SGroup = new aws.ec2.SecurityGroup("webAppSecurityGroup",{
    vpcId:vpc.id,
    ingress:[
      {
        protocol: "tcp",
        fromPort: 3000, // for web application port
        toPort: 3000,
        securityGroups :[loadBalancerSecurityGroup.id],
   //     cidrBlocks: ["0.0.0.0/0"],
      },
      {
        protocol: "tcp", // for ssh
        fromPort: 22,
        toPort: 22,
     //   cidrBlocks: ["0.0.0.0/0"],
        securityGroups :[loadBalancerSecurityGroup.id],
      },
    ],
    egress: [
      {
          protocol: "-1", // -1 means all protocols
          fromPort: 0,
          toPort: 0, // Set both fromPort and toPort to 0 to allow all ports
          cidrBlocks: ["0.0.0.0/0"],
      }
  ]

  });


// export const autoScalingGroupName = autoScalingGroup.name;

 
// Create DB security group
const dbSecurityGroup = new aws.ec2.SecurityGroup("db-security-group", {
  description: "Database Security Group",
  vpcId: vpc.id,
});
 
// Ingress rules
const db_ingressRules = [
  {
    protocol: "tcp",
    fromPort: 3306,
    toPort: 3306,
   // cidrBlocks: [cidrBlock_publicRouting],
   //cidrBlocks: ["0.0.0.0/0"],

  }
];
 
db_ingressRules.forEach((rule, index) => {
 
  const db_ingressRule = new aws.ec2.SecurityGroupRule(`ingress-rule-4`, {
    type: "ingress",
    fromPort: rule.fromPort,
    toPort: rule.toPort,
    protocol: rule.protocol,
    sourceSecurityGroupId: EC2SGroup.id,
    securityGroupId: dbSecurityGroup.id,
    //vpcId: vpc.id
    vpcId:vpc.id,
  });
 
});
 
// Create DB parameter group
const dbParamGroup = new aws.rds.ParameterGroup("db-param-group", {
  name: "cloud-assign6-params-group0",
  family: "mysql8.0", // or postgresql9.6, etc
  description: "Custom parameters for my RDS instance",
  max_user_connections: 100,
  parameter: [
    {
      name:'character_set_server',
      value:'utf8'
    },
    {
      name: "collation_server",
      value: "utf8_general_ci"
    }
  ]
});
 
// Create RDS subnet group
const dbSubnetGroup = new aws.rds.SubnetGroup("db-subnet-group", {
  // subnetIds: privateSubnets.map(s => s.id)
  subnetIds: subnetDetails.map(s => s.id)
 
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
  vpcSecurityGroupIds: [ dbSecurityGroup.id ]

});
  
// Create a Load Balancer
const loadBalancer = new aws.lb.LoadBalancer("webAppLB", {
    name: "csye6225-lb",
    internal: false,
    loadBalancerType: "application",
    securityGroups: [loadBalancerSecurityGroup.id],
    subnets: publicSubnetIds,
    enableDeletionProtection: false,
    tags: {
      Application: "WebApp",
    },
  });

  
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
    port: "80",
    protocol: "HTTP",
    defaultActions: [
      {
        type: "forward",
        targetGroupArn: targetGroup.arn,
      },
    ],
  });
  
  
  const DB_HOST = pulumi.interpolate`${dbInstance.address}`; 
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
  const base64UserData = Buffer.from(userData).toString('base64');
  console.log(base64UserData);
  
  const hostedZoneName = "dev.networksturcture.pro"; // Replace with your actual domain name
  const aRecordName = "networkstructures.pro"; // Replace with your actual domain name
  
  const zonePromise = aws.route53.getZone({ name: config.require('Arecord') }, { async: true });
  
  
  
  // Create an IAM role
  const ec2Role = new aws.iam.Role("EC2Role", {
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
  

// Attach the CloudWatchAgentServerPolicy to the IAM role
const cloudWatchAgentServerPolicyAttachment = new aws.iam.RolePolicyAttachment("CloudWatchAgentServerPolicyAttachment", {
  policyArn: "arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy",
  role: ec2Role.name,
});


  // Create an instance profile and associate the IAM role with it
  const instanceProfile = new aws.iam.InstanceProfile("EC2InstanceProfile", {
    role: ec2Role.name,
  });
  
  const launchtemplate = new aws.ec2.LaunchTemplate("launchtemplate", {
    name: "asg_launch_config",
    imageId: "ami-04baf520d3c9a874b", // Replace with your AMI ID
    instanceType: "t2.micro",
    keyName: keyPairName, // Replace with your key name
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
        securityGroups: [EC2SGroup.id], // Replace with your security group ID
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
    userData: userData.apply((data) =>
      Buffer.from(data).toString("base64")
    ),
  });
  

  // Create an Auto Scaling Group
  const asg = new aws.autoscaling.Group("asg", {
    name: "asg_launch_config",
    maxSize: 3,
    minSize: 1,
    desiredCapacity: 1,
    forceDelete: true,
    defaultCooldown: 60,
    vpcZoneIdentifiers: subnetDetails,
    instanceProfile: instanceProfile.name,
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
  
})



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
// zonePromise.then(zone=>{
//   const aRecord = new aws.route53.Record("a-record", {
//     name: config.require('Arecord'),
//     type: "A",
//     zoneId: zone.zoneId,
//     records: [applicationEc2Instance.publicIp], 
//     ttl: 60, 
  
// }, 
//    {dependsOn: [applicationEc2Instance]}
// );
// });

//});

// export const vpcId = vpc.id;


