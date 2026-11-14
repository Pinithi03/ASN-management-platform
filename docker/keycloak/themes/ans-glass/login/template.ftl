<#macro registrationLayout bodyClass="" displayInfo=false displayMessage=true displayRequiredFields=false showAnotherWayIfPresent=true>
<!DOCTYPE html>
<html lang="${locale.currentLanguageTag}">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex, nofollow">
    <title>${msg("loginTitle",(realm.displayName!''))}</title>
    <#if properties.styles?has_content>
        <#list properties.styles?split(' ') as style>
            <link href="${url.resourcesPath}/${style}" rel="stylesheet" />
        </#list>
    </#if>
</head>
<body class="kc-body ${bodyClass}">
<div class="kc-page">

    <div class="kc-header-title">
        <h1 class="kc-brand-text">${realm.displayName!"ASN Portal"}</h1>
        <p class="kc-brand-subtitle">Advanced Shipping Note</p>
    </div>

    <div class="kc-glass-card">

        <#if realm.internationalizationEnabled && locale.supported?size gt 1>
            <div class="kc-locale">
                <#list locale.supported as l>
                    <a class="kc-locale-link<#if (l.languageTag!'') == locale.currentLanguageTag> kc-locale-active</#if>"
                       href="${l.url}">${l.label}</a>
                </#list>
            </div>
        </#if>

        <div class="kc-card-header">
            <h2 class="kc-card-title"><#nested "header"></h2>
            <div class="kc-divider"></div>
        </div>

        <#if displayRequiredFields>
            <p class="kc-required-hint"><span class="kc-required">*</span> ${msg("requiredFields")}</p>
        </#if>

        <#if displayMessage && message?? && message.summary?has_content>
            <div class="kc-feedback-text kc-feedback-${message.type}">
                ${kcSanitize(message.summary)?no_esc}
            </div>
        </#if>

        <#nested "form">

        <#if auth?has_content && auth.showTryAnotherWayLink() && showAnotherWayIfPresent>
            <form action="${url.loginAction}" method="post" class="kc-another-way">
                <input type="hidden" name="tryAnotherWay" value="on"/>
                <button type="submit" class="kc-button kc-button-link">${msg("doTryAnotherWay")}</button>
            </form>
        </#if>

        <#nested "socialProviders">

        <#if displayInfo>
            <div class="kc-info">
                <#nested "info">
            </div>
        </#if>

    </div>
</div>
</body>
</html>
</#macro>
