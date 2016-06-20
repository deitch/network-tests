#!/bin/bash

set -e

# IP1 is used for the network
# IP2 is used for the bridge
# IP3 is used for netserver
# IP4 is used for netperf

IFS=',' read -ra PRIVATEIPSA <<< "$PRIVATEIPS"

localIP=${PRIVATEIPSA[2]}
remoteIP=${PRIVATEIPSA[2]}

echo $localIP $remoteIP
