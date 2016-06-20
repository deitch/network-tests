#!/bin/bash

set -e

docker run --net=weave -d --name=netserver netperf netserver -D -p $NETSERVERPORT

