#!/bin/bash

set -e

COMMON=$(dirname "${BASH_SOURCE[0]}")/../../common
. $COMMON/getoption

docker run --net=overlay -d --name=netserver netperf netserver -D -p $NETSERVERPORT

