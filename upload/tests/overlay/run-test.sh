#!/bin/bash

set -e


COMMON=$(dirname "${BASH_SOURCE[0]}")/../../common
. $COMMON/getoption

docker run --rm --net=overlay --name=netperf netperf $1

