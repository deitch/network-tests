#!/bin/bash

set -e

COMMON=$(dirname "${BASH_SOURCE[0]}")/../../common
. $COMMON/getoption

IP1=${PRIVATEIPS[0]}
IP2=${PRIVATEIPS[1]}
IP3=${PRIVATEIPS[2]}
IP4=${PRIVATEIPS[3]}


# we used IP2 for bridge, IP3 for netserver, IP4 for netperf
echo $IP3 $IP4
