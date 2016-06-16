#!/bin/bash

set -e

COMMON=$(dirname "${BASH_SOURCE[0]}")/../../common

. $COMMON/getoption

# get our management IP
nic=team0
mgmt=$(ip addr show $nic | awk '/10\.[0-9]+\.[0-9]+\.[0-9]+\/[0-9]+/ {print $2}')
mgmt=${mgmt%%/*}

localIP=$mgmt
remoteIP=$mgmt



echo $localIP $remoteIP