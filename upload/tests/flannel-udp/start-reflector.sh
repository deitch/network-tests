#!/bin/bash

set -e

docker run -d --name=netserver netperf netserver -D -p $NETSERVERPORT

