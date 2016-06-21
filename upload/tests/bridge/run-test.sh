#!/bin/bash

set -e



docker run --rm -p $LOCALPORT:$LOCALPORT -p $LOCALPORT:$LOCALPORT/udp --net=bridge --name=netperf netperf $@

