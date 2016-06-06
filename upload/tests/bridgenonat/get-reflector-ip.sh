#!/bin/bash

set -e

IP1=$1
IP2=$2
IP3=$3
IP4=$4

# IP1 is used for the network
# IP2 is used for the bridge
# IP3 is used for netserver
# IP4 is used for netperf

localIP=$IP3
remoteIP=$IP3

echo $localIP $remoteIP
