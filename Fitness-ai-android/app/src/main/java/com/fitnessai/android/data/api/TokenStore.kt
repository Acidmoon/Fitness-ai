package com.fitnessai.android.data.api

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

interface TokenStore {
    suspend fun getAccessToken(): String?
    fun currentAccessToken(): String?
    suspend fun saveAccessToken(token: String)
    suspend fun clearAccessToken()

    suspend fun getRefreshToken(): String? = null
    suspend fun saveRefreshToken(token: String) = Unit
    suspend fun clearRefreshToken() = Unit
    suspend fun saveTokens(accessToken: String, refreshToken: String) {
        saveAccessToken(accessToken)
        saveRefreshToken(refreshToken)
    }
    suspend fun clearAll() {
        clearAccessToken()
        clearRefreshToken()
    }
}

private val Context.fitnessAiTokenDataStore by preferencesDataStore(name = "fitness_ai_tokens")

class PreferencesTokenStore(context: Context) : TokenStore {
    private val dataStore = context.applicationContext.fitnessAiTokenDataStore
    private val cachedToken = MutableStateFlow<String?>(null)
    private val cachedRefreshToken = MutableStateFlow<String?>(null)
    private var hasLoadedToken = false

    override suspend fun getAccessToken(): String? {
        if (!hasLoadedToken) {
            cachedToken.value = dataStore.data.map { preferences ->
                preferences[ACCESS_TOKEN]
            }.first()
            cachedRefreshToken.value = dataStore.data.map { preferences ->
                preferences[REFRESH_TOKEN]
            }.first()
            hasLoadedToken = true
        }
        return cachedToken.value
    }

    override fun currentAccessToken(): String? = cachedToken.value

    override suspend fun saveAccessToken(token: String) {
        cachedToken.value = token
        hasLoadedToken = true
        dataStore.edit { preferences -> preferences[ACCESS_TOKEN] = token }
    }

    override suspend fun clearAccessToken() {
        cachedToken.value = null
        hasLoadedToken = true
        dataStore.edit { preferences -> preferences.remove(ACCESS_TOKEN) }
    }

    override suspend fun getRefreshToken(): String? = cachedRefreshToken.value

    override suspend fun saveRefreshToken(token: String) {
        cachedRefreshToken.value = token
        dataStore.edit { preferences -> preferences[REFRESH_TOKEN] = token }
    }

    override suspend fun clearRefreshToken() {
        cachedRefreshToken.value = null
        dataStore.edit { preferences -> preferences.remove(REFRESH_TOKEN) }
    }

    override suspend fun saveTokens(accessToken: String, refreshToken: String) {
        cachedToken.value = accessToken
        cachedRefreshToken.value = refreshToken
        hasLoadedToken = true
        dataStore.edit { preferences ->
            preferences[ACCESS_TOKEN] = accessToken
            preferences[REFRESH_TOKEN] = refreshToken
        }
    }

    override suspend fun clearAll() {
        cachedToken.value = null
        cachedRefreshToken.value = null
        hasLoadedToken = true
        dataStore.edit { preferences ->
            preferences.remove(ACCESS_TOKEN)
            preferences.remove(REFRESH_TOKEN)
        }
    }

    private companion object {
        val ACCESS_TOKEN = stringPreferencesKey("access_token")
        val REFRESH_TOKEN = stringPreferencesKey("refresh_token")
    }
}

class InMemoryTokenStore(initialToken: String? = null) : TokenStore {
    private val accessToken = MutableStateFlow(initialToken)
    private val refreshToken = MutableStateFlow<String?>(null)

    override suspend fun getAccessToken(): String? = accessToken.value

    override fun currentAccessToken(): String? = accessToken.value

    override suspend fun saveAccessToken(token: String) {
        accessToken.value = token
    }

    override suspend fun clearAccessToken() {
        accessToken.value = null
    }

    override suspend fun getRefreshToken(): String? = refreshToken.value

    override suspend fun saveRefreshToken(token: String) {
        refreshToken.value = token
    }

    override suspend fun clearRefreshToken() {
        refreshToken.value = null
    }

    override suspend fun saveTokens(at: String, rt: String) {
        accessToken.value = at
        refreshToken.value = rt
    }

    override suspend fun clearAll() {
        accessToken.value = null
        refreshToken.value = null
    }
}
