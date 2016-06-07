#!/bin/bash

set -e

IP1=$1
IP2=$2
IP3=$3
IP4=$4

# IP1 is used for the network
# IP2 is unused
# IP3 is used for netserver
# IP4 is used for netperf

localIP=$IP3
remoteIP=$(awk '{print $1}' /tmp/private_management_ip)
# remoteIP needs to be without cidr
remoteIP=${remoteIP%%/*}

echo $localIP $remoteIP
