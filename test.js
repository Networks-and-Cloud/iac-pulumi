import  SubnetCIDRAdviser from  'subnet-cidr-calculator';

var data=SubnetCIDRAdviser.getIpRangeForSubnet("10.0.0.0/16",6)
console.log(data)