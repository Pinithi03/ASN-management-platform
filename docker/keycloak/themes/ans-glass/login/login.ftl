<#import "template.ftl" as layout>
<@layout.registrationLayout displayMessage=!messagesPerField.existsError('username','password') displayInfo=realm.password && realm.registrationAllowed && !registrationDisabled??; section>

    <#if section = "header">
        ${msg("doLogIn")}

    <#elseif section = "form">
        <#if realm.password>
            <form id="kc-form-login" class="kc-form" action="${url.loginAction}" method="post" novalidate="novalidate">

                <#if !usernameHidden??>
                    <div class="kc-form-group">
                        <label for="username" class="kc-label">
                            <#if !realm.loginWithEmailAllowed>${msg("username")}
                            <#elseif !realm.registrationEmailAsUsername>${msg("usernameOrEmail")}
                            <#else>${msg("email")}</#if>
                        </label>
                        <input tabindex="1" id="username" class="kc-input" name="username"
                               value="${(login.username!'')}" type="text" autofocus
                               autocomplete="username"
                               aria-invalid="<#if messagesPerField.existsError('username','password')>true</#if>" />
                        <#if messagesPerField.existsError('username','password')>
                            <span class="kc-field-error" aria-live="polite">
                                ${kcSanitize(messagesPerField.getFirstError('username','password'))?no_esc}
                            </span>
                        </#if>
                    </div>
                </#if>

                <div class="kc-form-group">
                    <label for="password" class="kc-label">${msg("password")}</label>
                    <div class="kc-input-group">
                        <input tabindex="2" id="password" class="kc-input" name="password" type="password"
                               autocomplete="current-password"
                               aria-invalid="<#if messagesPerField.existsError('username','password')>true</#if>" />
                        <#-- Same contract as the base theme: passwordVisibility.js (inherited
                             from base/login/resources) swaps the icon class and aria-label. -->
                        <button class="kc-pw-toggle" type="button" aria-label="${msg('showPassword')}"
                                aria-controls="password" data-password-toggle
                                data-icon-show="kc-pw-icon-show" data-icon-hide="kc-pw-icon-hide"
                                data-label-show="${msg('showPassword')}" data-label-hide="${msg('hidePassword')}">
                            <i class="kc-pw-icon-show" aria-hidden="true"></i>
                        </button>
                    </div>
                </div>

                <div class="kc-form-options">
                    <#if realm.rememberMe && !usernameHidden??>
                        <label class="kc-checkbox">
                            <input tabindex="3" id="rememberMe" name="rememberMe" type="checkbox"
                                   <#if login.rememberMe??>checked</#if> />
                            <span>${msg("rememberMe")}</span>
                        </label>
                    <#else>
                        <span></span>
                    </#if>
                    <#if realm.resetPasswordAllowed>
                        <a tabindex="5" class="kc-link" href="${url.loginResetCredentialsUrl}">${msg("doForgotPassword")}</a>
                    </#if>
                </div>

                <input type="hidden" id="id-hidden-input" name="credentialId"
                       <#if auth.selectedCredential?has_content>value="${auth.selectedCredential}"</#if> />
                <button tabindex="4" class="kc-button kc-button-primary kc-button-block" name="login" id="kc-login" type="submit">
                    ${msg("doLogIn")}
                </button>
            </form>
        </#if>

        <script type="module" src="${url.resourcesPath}/js/passwordVisibility.js"></script>

    <#elseif section = "socialProviders">
        <#if realm.password && social?? && social.providers?? && social.providers?has_content>
            <div class="kc-divider"></div>
            <div class="kc-social">
                <#list social.providers as p>
                    <a class="kc-button kc-button-social kc-button-block" href="${p.loginUrl}" id="social-${p.alias}">
                        ${p.displayName!}
                    </a>
                </#list>
            </div>
        </#if>

    <#elseif section = "info">
        <#if realm.password && realm.registrationAllowed && !registrationDisabled??>
            <p class="kc-footer-text">
                ${msg("noAccount")} <a tabindex="6" class="kc-link" href="${url.registrationUrl}">${msg("doRegister")}</a>
            </p>
        </#if>
    </#if>

</@layout.registrationLayout>
