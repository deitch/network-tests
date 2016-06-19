#!/bin/bash

set -e

COMMON=$(dirname "${BASH_SOURCE[0]}")/../../common
. $COMMON/getoption

npname=netperf-$(hostname)

cid=$(docker run -t -d --net=calico --name=$npname netperf sh)

