#!/bin/bash

set -e

docker run --rm --name=netperf netperf $1

