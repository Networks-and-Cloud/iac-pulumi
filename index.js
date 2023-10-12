//import * as aws from "@pulumi/aws";

//import * as pulumi from "@pulumi/pulumi";

const aws = require("@pulumi/aws");
const pulumi = require("@pulumi/pulumi");



const webAppConfig=  new pulumi.Config("webApp");
const awsConfig=  new pulumi.Config("aws");
console.log(awsConfig.require("profile"))

// Create a new VPC

const vpc = new aws.ec2.Vpc("webappVPC", {

  cidrBlock:webAppConfig.get("cidrBlock") ,

});

// Variable to hold subnet details
aws.getAvailabilityZones({ state: "available" }).then((response) => {

  const subnetDetails = [];

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

});

 

// Create 3 public and 3 private subnets

 

// Export VPC ID

// export const vpcId = vpc.id;

