#!/bin/bash

set -e

IFS=',' read -ra PRIVATEIPSA <<< "$PRIVATEIPS"

IP1=${PRIVATEIPSA[0]}
IP2=${PRIVATEIPSA[1]}
IP3=${PRIVATEIPSA[2]}
IP4=${PRIVATEIPSA[3]}


# we used IP2 for bridge, IP3 for netserver, IP4 for netperf
echo $IP2 $IP3 $IP4
