#!/bin/bash

set -e

docker inspect --format '{{ .NetworkSettings.IPAddress }}' netserver
