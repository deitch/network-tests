#!/bin/bash

set -e

docker run --rm --net=calico --name=netperf netperf $1

