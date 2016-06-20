#!/bin/bash

set -e


COMMON=$(dirname "${BASH_SOURCE[0]}")/../../common
. $COMMON/getoption

docker run --rm -p $LOCALPORT:$LOCALPORT -p $LOCALPORT:$LOCALPORT/udp --net=bridge --name=netperf netperf $1

