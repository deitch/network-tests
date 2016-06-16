#!/bin/bash

set -e

# check if busses were assigned by the kernel; this often is necessary because of BIOS issues
if ! grep -wq pci=assign-busses /proc/cmdline; then
	# add it and reboot
	sed -i 's/\(GRUB_CMDLINE_LINUX=".*\)"$/\1pci=assign-busses"/g' /etc/default/grub
	grub2-mkconfig -o /boot/grub2/grub.cfg
	echo "REBOOT"
	reboot
fi