#!/bin/bash

set -e

docker run --rm --net=weave --name=netperf netperf $@

