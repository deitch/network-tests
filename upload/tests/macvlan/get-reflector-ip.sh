#!/bin/bash

set -e

IFS=',' read -ra PRIVATEIPSA <<< "$PRIVATEIPS"

IP1=${PRIVATEIPSA[0]}
IP2=${PRIVATEIPSA[1]}
IP3=${PRIVATEIPSA[2]}
IP4=${PRIVATEIPSA[3]}

# IP1 is used for the network
# IP2 is unused
# IP3 is used for netserver
# IP4 is used for netperf

localIP=$IP3
remoteIP=$PRIVATEMGMTIP

echo $localIP $remoteIP
