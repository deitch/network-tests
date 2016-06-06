#!/bin/bash

set -e

TARGET=$1
PROTOCOL=$2
REPS=$3
CONTROLPORT=$4
SIZE=$5
LOCALPORT=$6
REMOTEPORT=$7

docker run --rm -p $LOCALPORT:$LOCALPORT -p $LOCALPORT:$LOCALPORT/udp --net=bridge --name=netperf netperf netperf -P 0 -H $TARGET -c -t ${PROTOCOL}_RR -l -${REPS} -v 2 -p $CONTROLPORT -- -k -r ${SIZE},${SIZE} -P ${LOCALPORT},${REMOTEPORT}

