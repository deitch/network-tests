#!/bin/bash

set -e


COMMON=$(dirname "${BASH_SOURCE[0]}")/../../common
. $COMMON/getoption

docker run --rm --net=overlay --name=netperf netperf netperf -P 0 -H $TARGET -c -t ${PROTOCOL}_RR -l -${REPS} -v 2 -p $CONTROLPORT -- -k ${TESTUNITS} -r ${SIZE},${SIZE} -P ${LOCALPORT},${REMOTEPORT}

