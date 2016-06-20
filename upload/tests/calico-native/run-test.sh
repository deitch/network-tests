#!/bin/bash

set -e

COMMON=$(dirname "${BASH_SOURCE[0]}")/../../common
. $COMMON/getoption

npname=netperf-$(hostname)

docker exec -i $npname $1
docker kill $npname >/dev/null 2>&1
docker rm $npname >/dev/null 2>&1
