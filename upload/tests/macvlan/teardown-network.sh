#!/bin/bash

nic=team0

# get our management IP and gateway
mgmt=$(awk '{print $1}' /tmp/private_management_ip )
gateway=$(awk '{print $2}' /tmp/private_management_ip )

# add IP
ip addr add $mgmt dev $nic
# add route
ip route add 10.0.0.0/8 via $gateway dev $nic

# must ping the gateway so it register our mac address
ping -c 3 -W 2 $gateway >/dev/null 2>&1 || true

