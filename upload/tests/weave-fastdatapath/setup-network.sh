#!/bin/bash

set -e

# set up network with private IPs for host 
# for net=bridge, simply put both addresses on lo
# because of port mapping, it will work just fine


COMMON=$(dirname "${BASH_SOURCE[0]}")/../../common
. $COMMON/getoption

IPRANGE=192.168.0.0/16

# open the firewall ports necessary
firewall-cmd --zone=trusted --add-source=$IPRANGE


# need to account for our remote peers
weave launch --ipalloc-range $IPRANGE $PEER


