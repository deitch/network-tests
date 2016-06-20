#!/bin/bash

set -e

# stop weave
weave reset

# remove firewall ports
IPRANGE=192.168.0.0/16

# open the firewall ports necessary
firewall-cmd --zone=trusted --remove-source=$IPRANGE
