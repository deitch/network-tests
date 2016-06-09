#!/bin/bash

set -e

COMMON=$(dirname "${BASH_SOURCE[0]}")/../../common
. $COMMON/getoption

IP1=${PRIVATEIPS[0]}
IP2=${PRIVATEIPS[1]}
IP3=${PRIVATEIPS[2]}
IP4=${PRIVATEIPS[3]}

# IP1 is used for the network
# IP2 is unused
# IP3 is used for netserver
# IP4 is used for netperf

localIP=$IP3
remoteIP=$(awk '{print $1}' /tmp/private_management_ip)
# remoteIP needs to be without cidr
remoteIP=${remoteIP%%/*}

echo $localIP $remoteIP
