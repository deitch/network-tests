#!/bin/bash

set -e


# for Mellanox enabled servers, we need to set up the right software
# 1. Download the latest firmware mlx http://www.mellanox.com/downloads/firmware/ConnectX3-rel-2_36_5000-web.tgz
# 2. Get the current config as an ini file using flint dc
#     flint -d /dev/mst/mt4099_pciconf0 dc
# 3. Change the ini to support iov
#   [HCA]
#   total_vfs = 16 // Total number of VMs
#   sriov_en = true // SR-IOV is enabled
# 4. Create a new firmware .bin combining the mlx firmware from the MFA and the modified ini
#   mlxburn -fw ./fw-ConnectX3-rel.mlx -c mlx_with_iov.ini -wrimage cx3_with_iov.bin
# 5. Burn the new .bin firmware to the device
#   mlxburn -d /dev/mst/mt4099_pci_cr0 -i ./cx3_with_iov.bin
# 6. Set the kernel options in modprobe.d
# 7. set the device configuration for SR_IOV using mlxconfig
# 8. reboot
# 
# 
# how to check if the config has SR_IOV:
#    mlxconfig -d /dev/mst/mt4099_pciconf0 q | grep SRIOV_EN | grep -wqi true
# how to check if the firmware has SR_IOV
#     flint -d /dev/mst/mt4099_pciconf0 dc | grep -i iov
if lspci | grep -iqw Mellanox; then
	if ! command -v mlxconfig; then
		curl -LO http://www.mellanox.com/downloads/MFT/mft-4.4.0-44.tgz
		tar -zxvf mft-4.4.0-44.tgz
		yum install -y rpm-build kernel-devel
		./mft-4.4.0-44/install.sh
		# next we need the firmware files
		mkdir -p mlx_firmware
	fi
	# check if SR-IOV is enabled
	mst start
	if mlxconfig -d /dev/mst/mt4099_pciconf0 q | grep SRIOV_EN | grep -wqi false ; then
		mlxconfig -y -d /dev/mst/mt4099_pciconf0 set SRIOV_EN=1 NUM_OF_VFS=8
		# and set the correct option
		CONFFILE=/etc/modprobe.d/mlx4.conf
		# make sure there is a newline before we put it in
		echo >> $CONFFILE
		echo options mlx4_core probe_vf=1 num_vfs=8 >> $CONFFILE
		
		REBOOT=yes
	fi
fi


# check if busses were assigned by the kernel; this often is necessary because of BIOS issues
if ! grep -wq pci=assign-busses /proc/cmdline; then
	# add it and reboot
	sed -i 's/\(GRUB_CMDLINE_LINUX=".*\)"$/\1 pci=assign-busses"/g' /etc/default/grub
	grub2-mkconfig -o /boot/grub2/grub.cfg
	REBOOT=yes
fi
if ! grep -wq intel_iommu=on /proc/cmdline; then
	# add it and reboot
	sed -i 's/\(GRUB_CMDLINE_LINUX=".*\)"$/\1 intel_iommu=on"/g' /etc/default/grub
	grub2-mkconfig -o /boot/grub2/grub.cfg
	REBOOT=yes
fi


if [[ "$REBOOT" == "yes" ]]; then
	echo "REBOOT"
	reboot
fi
	