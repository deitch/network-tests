#!/bin/bash

set -e

COMMON=$(dirname "${BASH_SOURCE[0]}")/../../common
. $COMMON/getoption

# stop weave
weave reset

# remove firewall ports
IPRANGE=192.168.0.0/16

# open the firewall ports necessary
firewall-cmd --zone=trusted --remove-source=$IPRANGE
