#!/bin/bash

set -e

COMMON=$(dirname "${BASH_SOURCE[0]}")/../../common
. $COMMON/getoption

npname=netperf-$(hostname)

docker exec -i $npname netperf  -P 0 -H $TARGET -c -t ${PROTOCOL}_RR -l -${REPS} -v 2 -p $CONTROLPORT -- -k ${TESTUNITS} -r ${SIZE},${SIZE} -P ${LOCALPORT},${REMOTEPORT}
docker kill $npname >/dev/null 2>&1
docker rm $npname >/dev/null 2>&1
