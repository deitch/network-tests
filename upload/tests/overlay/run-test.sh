#!/bin/bash

set -e


docker run --rm --net=overlay --name=netperf netperf $1

