#!/bin/bash

set -e

# IP1 is used for the network
# IP2 is used for the bridge
# IP3 is used for netserver
# IP4 is used for netperf

COMMON=$(dirname "${BASH_SOURCE[0]}")/../../common
. $COMMON/getoption


localIP=${PRIVATEIPS[2]}
remoteIP=$(awk '{print $1}' /tmp/private_management_ip)
# remoteIP needs to be without cidr
remoteIP=${remoteIP%%/*}


echo $localIP $remoteIP
