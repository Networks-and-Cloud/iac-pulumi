import * as aws from "@pulumi/aws";
//import { RdsDbInstance } from "@pulumi/aws/opsworks";
import * as pulumi from "@pulumi/pulumi";

const webAppConfig=  new pulumi.Config("webApp");

// Create a new VPC
const vpc = new aws.ec2.Vpc("webappVPC", {
  cidrBlock:webAppConfig.get("cidrBlock") ,
});
console.log (vpc.id)
// Variable to hold subnet details

aws.getAvailabilityZones({ state: "available" }).then((response) => {
  const subnetDetails = [];
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

  const Ec2SecurityGroup= new aws.ec2.SecurityGroup("webAppSecurityGroup",{
    vpcId:vpc.id,
    ingress:[
      {
        protocol: "tcp",
        fromPort: 3000, // for web application port
        toPort: 3000,
        cidrBlocks: ["0.0.0.0/0"],
      },
      {
        protocol: "tcp", // for ssh
        fromPort: 22,
        toPort: 22,
        cidrBlocks: ["0.0.0.0/0"],
      },
      {
        protocol: "tcp",
        fromPort: 80, // for http traffic
        toPort: 80,
        cidrBlocks: ["0.0.0.0/0"],
      },
      {
        protocol: "tcp",
        fromPort: 443, // for https traffic
        toPort: 443,
        cidrBlocks: ["0.0.0.0/0"],
      },
    ]
  });

 
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
   cidrBlocks: ["0.0.0.0/0"],

  }
];
 
db_ingressRules.forEach((rule, index) => {
 
  const db_ingressRule = new aws.ec2.SecurityGroupRule(`ingress-rule-4`, {
    type: "ingress",
    fromPort: rule.fromPort,
    toPort: rule.toPort,
    protocol: rule.protocol,
    sourceSecurityGroupId: Ec2SecurityGroup.id,
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
  password: new pulumi.secret("vidish11"),
 
  publiclyAccessible: false,
  dbName: "csye6225",
  skipFinalSnapshot: true,
  vpcSecurityGroupIds: [ dbSecurityGroup.id ]

});

const DB_HOST = pulumi.interpolate`${dbInstance.endpoint}`; 
const userData = pulumi.interpolate`#!/bin/bash

# Define the path to the .env file
envFile="/home/admin/webapp/.env"
 
# Check if the .env file exists
if [ -e "$envFile" ]; then
  # If it exists, remove it
  sudo rm "$envFile"
fi
 
# Create the .env file
sudo touch "$envFile"
echo "DB_NAME=${dbInstance.dbName}" | sudo tee -a "$envFile"
echo "DB_HOST=${DB_HOST}" | sudo tee -a "$envFile"
echo "DB_USERNAME=${dbInstance.username}" | sudo tee -a "$envFile"
echo "DB_PASSWORD=${dbInstance.password}" | sudo tee -a "$envFile"
echo "PORT=3306" | sudo tee -a "$envFile"
echo "DB_Dailect=${dbInstance.engine}" | sudo tee -a "$envFile"
sudo chown -R csye6225:csye6225 /home/admin/webapp/
sudo chmod -R 755 /home/admin/webapp/
sudo systemctl enable unit
sudo systemctl start unit`

// EC2 instance 
const applicationEc2Instance= new aws.ec2.Instance("appEC2Instance",{
   // DependsOn:[dbInstance],
    instanceType: "t2.micro", // creating the ec2 instance
    vpcSecurityGroupIds: [Ec2SecurityGroup.id],
    ami: "ami-06db4d78cb1d3bbf9",

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
    userData:userData,

  })


});

// Export VPC ID
export const vpcId = vpc.id;
