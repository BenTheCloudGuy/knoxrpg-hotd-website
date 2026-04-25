
export subscriptionId="856bfc7f-913e-4658-92bc-cb6404cfa32a";
export resourceGroup="cloudgeek-cus-arc";
export tenantId="9e6ca1ca-e3c7-4de0-a99c-dce74bd48a19";
export location="centralus";
export authType="token";
export correlationId="61e72a53-f654-4da5-8d2c-8d7855f5e9ab";
export cloud="AzureCloud";


# Download the installation package
LINUX_INSTALL_SCRIPT="/tmp/install_linux_azcmagent.sh"
if [ -f "$LINUX_INSTALL_SCRIPT" ]; then rm -f "$LINUX_INSTALL_SCRIPT"; fi;
output=$(wget https://gbl.his.arc.azure.com/azcmagent-linux -O "$LINUX_INSTALL_SCRIPT" 2>&1);
if [ $? != 0 ]; then wget -qO- --method=PUT --body-data="{\"subscriptionId\":\"$subscriptionId\",\"resourceGroup\":\"$resourceGroup\",\"tenantId\":\"$tenantId\",\"location\":\"$location\",\"correlationId\":\"$correlationId\",\"authType\":\"$authType\",\"operation\":\"onboarding\",\"messageType\":\"DownloadScriptFailed\",\"message\":\"$output\"}" "https://gbl.his.arc.azure.com/log" &> /dev/null || true; fi;
echo "$output";

# Install the hybrid agent
bash "$LINUX_INSTALL_SCRIPT";
sleep 5;

# Run connect command
sudo azcmagent connect --resource-group "$resourceGroup" --tenant-id "$tenantId" --location "$location" --subscription-id "$subscriptionId" --cloud "$cloud" --tags 'Datacenter=HomeLab,City=Detroit,StateOrDistrict=MI,CountryOrRegion=CentralUS,Hostname=Cortana,ArcSQLServerExtensionDeployment=Disabled' --correlation-id "$correlationId";
