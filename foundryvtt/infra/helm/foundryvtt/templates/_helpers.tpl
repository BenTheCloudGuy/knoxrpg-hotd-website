{{/*
Common labels for all HotD FoundryVTT resources.
*/}}
{{- define "hotd-foundry.labels" -}}
app: foundryvtt
instance: {{ .Values.instance.name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version }}
{{- end -}}

{{/*
Selector labels (stable across upgrades — do NOT add chart/version here).
*/}}
{{- define "hotd-foundry.selectorLabels" -}}
app: foundryvtt
instance: {{ .Values.instance.name }}
{{- end -}}

{{/*
Name of the Secret holding the license + admin keys.
*/}}
{{- define "hotd-foundry.secretName" -}}
{{- .Values.secrets.existingSecret | default "foundry-secrets" -}}
{{- end -}}
