import * as adalLib from 'adal-angular';
import { Adal8User } from './adal8-user';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs/internal/Observable';
import { bindCallback } from 'rxjs/internal/observable/bindCallback';
import { timer } from 'rxjs/internal/observable/timer';
import { Subscription } from 'rxjs/internal/Subscription';
import { first } from 'rxjs/operators';
import { isFunction } from 'rxjs/internal-compatibility';
import User = adal.User;
import DoRefreshExpirationParam = adal.DoRefreshExpirationParam;
import DoRefreshExpiration = adal.DoRefreshExpiration;

const defaultDoRefreshOption: DoRefreshExpiration = () => Promise.resolve(<DoRefreshExpirationParam>{ shouldProlong: true });

/**
 *
 *
 * @export
 * @class Adal8Service
 */
@Injectable()
export class Adal8Service {

    /**
     *
     *
     * @private
     * @type {adal.AuthenticationContext}
     * @memberOf Adal8Service
     */
    private adalContext: adal.AuthenticationContext;
    private loginRefreshTimer: Subscription;
    private doRefresh: DoRefreshExpiration;
    private doRefreshOption: DoRefreshExpiration;

    /**
     *
     *
     * @private
     * @type {Adal8User}
     * @memberOf Adal8Service
     */
    private adal8User: Adal8User = {
        authenticated: false,
        username: '',
        error: '',
        token: '',
        profile: {},
        loginCached: false
    };

    /**
     * Creates an instance of Adal8Service.
     *
     * @memberOf Adal8Service
     */
    constructor() {
    }

    /**
     *
     *
     * @readonly
     * @type {adal.Config}
     * @memberOf Adal8Service
     */
    public get config(): adal.Config {
        return this.adalContext.config;
    }

    /**
     *
     *
     * @readonly
     * @type {Adal8User}
     * @memberOf Adal8Service
     */
    public get userInfo(): Adal8User {
        return this.adal8User;
    }

    private get isInCallbackRedirectMode(): boolean {
        return window.location.href.indexOf('#access_token') !== -1 || window.location.href.indexOf('#id_token') !== -1;
    };

    /**
     *
     *
     * @param {adal.Config} configOptions
     *
     * @memberOf Adal8Service
     */
    public init(configOptions: adal.Config) {
        if (!configOptions) {
            throw new Error('You must set config, when calling init.');
        }

        // redirect and logout_redirect are set to current location by default
        const existingHash = window.location.hash;

        let pathDefault = window.location.href;
        if (existingHash) {
            pathDefault = pathDefault.replace(existingHash, '');
        }

        configOptions.redirectUri = configOptions.redirectUri || pathDefault;
        configOptions.postLogoutRedirectUri = configOptions.postLogoutRedirectUri || pathDefault;
        // Get backup of configuration RefreshOption
        this.doRefreshOption = configOptions.doRefresh || defaultDoRefreshOption;
        // Set the configuration
        this.doRefresh = this.doRefreshOption;

        // create instance with given config
        this.adalContext = adalLib.inject(configOptions);

        window.AuthenticationContext = this.adalContext.constructor;

        // loginresource is used to set authenticated status
        this.updateDataFromCache(this.adalContext.config.loginResource);

        if (this.adal8User.loginCached && !this.adal8User.authenticated && window.self == window.top && !this.isInCallbackRedirectMode) {
            // Override configuration if no authentication
            this.doRefresh = defaultDoRefreshOption;
            this.refreshLoginToken();
        } else if (this.adal8User.loginCached && this.adal8User.authenticated && !this.loginRefreshTimer && window.self == window.top) {
            this.setupLoginTokenRefreshTimer();
        }
    }

    /**
     *
     *
     *
     * @memberOf Adal8Service
     */
    public login(): void {
        this.adalContext.login();
    }

    /**
     *
     *
     * @returns {boolean}
     *
     * @memberOf Adal8Service
     */
    public loginInProgress(): boolean {
        return this.adalContext.loginInProgress();
    }

    /**
     *
     *
     *
     * @memberOf Adal8Service
     */
    public logOut(): void {
        this.adalContext.logOut();
    }

    /**
     *
     *
     *
     * @memberOf Adal8Service
     */
    public handleWindowCallback(): void {
        const hash = window.location.hash;
        if (this.adalContext.isCallback(hash)) {
            const requestInfo = this.adalContext.getRequestInfo(hash);
            this.adalContext.saveTokenFromHash(requestInfo);
            if (requestInfo.requestType === this.adalContext.REQUEST_TYPE.LOGIN) {
                this.updateDataFromCache(this.adalContext.config.loginResource);
                this.setupLoginTokenRefreshTimer();
            } else if (requestInfo.requestType === this.adalContext.REQUEST_TYPE.RENEW_TOKEN) {
                this.adalContext.callback = window.parent.callBackMappedToRenewStates[requestInfo.stateResponse];
            }

            if (requestInfo.stateMatch) {
                if (typeof this.adalContext.callback === 'function') {
                    if (requestInfo.requestType === this.adalContext.REQUEST_TYPE.RENEW_TOKEN) {
                        // Idtoken or Accestoken can be renewed
                        if (requestInfo.parameters['access_token']) {
                            this.adalContext.callback(this.adalContext._getItem(this.adalContext.CONSTANTS.STORAGE.ERROR_DESCRIPTION)
                                , requestInfo.parameters['access_token']);
                        } else if (requestInfo.parameters['error']) {
                            this.adalContext.callback(this.adalContext._getItem(this.adalContext.CONSTANTS.STORAGE.ERROR_DESCRIPTION), null);
                            this.adalContext._renewFailed = true;
                        }
                    }
                }
            }
        }

        // Remove hash from url
        if (window.location.hash) {
            window.location.href = window.location.href.replace(window.location.hash, '');
        }
    }

    /**
     *
     *
     * @param {string} resource
     * @returns {string}
     *
     * @memberOf Adal8Service
     */
    public getCachedToken(resource: string): string {
        return this.adalContext.getCachedToken(resource);
    }

    /**
     *
     *
     * @param {string} resource
     * @returns
     *
     * @memberOf Adal8Service
     */
    public acquireToken(resource: string): Observable<string> {
        const _this = this;   // save outer this for inner function

        let errorMessage: string;
        return bindCallback(acquireTokenInternal, function (token: string) {
            if (!token && errorMessage) {
                throw (errorMessage);
            }
            return token;
        })();

        function acquireTokenInternal(cb: any) {
            let s: string = null;

            _this.adalContext.acquireToken(resource, (error: string, tokenOut: string) => {
                if (error) {
                    _this.adalContext.error('Error when acquiring token for resource: ' + resource, error);
                    errorMessage = error;
                    cb(<string>null);
                } else {
                    cb(tokenOut);
                    s = tokenOut;
                }
            });
            return s;
        }
    }

    /**
     *
     *
     * @returns {Observable<adal.User>}
     *
     * @memberOf Adal8Service
     */
    public getUser(): Observable<any> {
        const _this = this;   // save outer this for inner function
        return bindCallback((cb: (u: adal.User) => User) => {
            _this.adalContext.getUser(function (error: string, user: adal.User) {
                if (error) {
                    _this.adalContext.error('Error when getting user', error);
                    cb(null);
                } else {
                    cb(user);
                }
            });
        })();
    }

    /**
     *
     *
     *
     * @memberOf Adal8Service
     */
    public clearCache(): void {
        this.adalContext.clearCache();
    }

    /**
     *
     *
     * @param {string} resource
     *
     * @memberOf Adal8Service
     */
    public clearCacheForResource(resource: string): void {
        this.adalContext.clearCacheForResource(resource);
    }

    /**
     *
     *
     * @param {string} message
     *
     * @memberOf Adal8Service
     */
    public info(message: string): void {
        this.adalContext.info(message);
    }

    /**
     *
     *
     * @param {string} message
     *
     * @memberOf Adal8Service
     */
    public verbose(message: string): void {
        this.adalContext.verbose(message);
    }

    /**
     *
     *
     * @param {string} url
     * @returns {string}
     *
     * @memberOf Adal8Service
     */
    public getResourceForEndpoint(url: string): string {
        return this.adalContext.getResourceForEndpoint(url);
    }

    /**
     *
     *
     * @returns {string}
     *
     * @memberOf Adal8Service
     */
    public getToken(): string {
        if (this.adalContext) {
            return this.adalContext._getItem(this.adalContext.CONSTANTS.STORAGE.ACCESS_TOKEN_KEY + this.adalContext.config.loginResource);
        } else {
            this.adal8User.token;
        }
    }

    /**
     *
     *
     *
     * @memberOf Adal8Service
     */
    public refreshDataFromCache() {
        this.updateDataFromCache(this.adalContext.config.loginResource);
    }

    /**
     *
     *
     * @private
     * @param {string} resource
     *
     * @memberOf Adal8Service
     */
    private updateDataFromCache(resource: string): void {
        const token = this.adalContext.getCachedToken(resource);
        this.adal8User.authenticated = token !== null && token.length > 0;
        const user = this.adalContext.getCachedUser() || { userName: '', profile: undefined };
        if (user) {
            this.adal8User.username = user.userName;
            this.adal8User.profile = user.profile;
            this.adal8User.token = token;
            this.adal8User.error = this.adalContext.getLoginError();
            this.adal8User.loginCached = true;
        } else {
            this.adal8User.username = '';
            this.adal8User.profile = {};
            this.adal8User.token = '';
            this.adal8User.error = '';
            this.adal8User.loginCached = false;
        }
    };

    /**
     *
     *
     *
     * @memberOf Adal8Service
     */
    public refreshLoginToken(): void {
        if (!this.adal8User.loginCached) {
            throw ('User not logged in');
        }
        this.doRefresh().then((doRefreshExpiration: DoRefreshExpirationParam) => {
            if (doRefreshExpiration.shouldProlong) {
                if (doRefreshExpiration.forceSetToken) {
                    this.handleWindowCallback();
                    this.refreshDataFromCache();
                }
                this.acquireToken(this.adalContext.config.loginResource).subscribe((token: string) => {
                    this.adal8User.token = token;
                    this.userInfo.token = token;
                    if (!this.adal8User.authenticated) {
                        // refresh the page
                        window.location.reload();
                    } else {
                        // Restore configuration if token true
                        this.doRefresh = this.doRefreshOption;
                        this.setupLoginTokenRefreshTimer();

                        if (isFunction(doRefreshExpiration.callbackFn)) {
                            doRefreshExpiration.callbackFn();
                        }
                    }
                }, (error: string) => {
                    this.rejectProlong();
                });
            } else {
                this.rejectProlong();
                this.clearCache();
            }
        }).catch(() => {
            console.warn('Do refresh task has been dismissed');
            this.doRefresh = defaultDoRefreshOption;
        });
    }

    public rejectProlong(): void {
        this.adal8User.authenticated = false;
        this.adal8User.error = this.adalContext.getLoginError();
    }

    private now(): number {
        return Math.round(new Date().getTime() / 1000.0);
    }

    private setupLoginTokenRefreshTimer(): void {
        // Get expiration of login token
        const exp = this.adalContext._getItem(this.adalContext.CONSTANTS.STORAGE.EXPIRATION_KEY + <any>this.adalContext.config.loginResource);

        // Either wait until the refresh window is valid or refresh in 1 second (measured in seconds)
        const timerDelay = exp - this.now() - (this.adalContext.config.expireOffsetSeconds || 300) > 0 ? exp - this.now() - (this.adalContext.config.expireOffsetSeconds || 300) : 1;
        if (this.loginRefreshTimer) {
            this.loginRefreshTimer.unsubscribe();
        }
        this.loginRefreshTimer = timer(timerDelay * 1000)
            .pipe(
                first()
            )
            .subscribe((x) => {
                this.refreshLoginToken();
            });

    }
}
