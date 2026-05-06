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
}

private val Context.fitnessAiTokenDataStore by preferencesDataStore(name = "fitness_ai_tokens")

class PreferencesTokenStore(context: Context) : TokenStore {
    private val dataStore = context.applicationContext.fitnessAiTokenDataStore
    private val cachedToken = MutableStateFlow<String?>(null)
    private var hasLoadedToken = false

    override suspend fun getAccessToken(): String? {
        if (!hasLoadedToken) {
            cachedToken.value = dataStore.data.map { preferences -> preferences[ACCESS_TOKEN] }.first()
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

    private companion object {
        val ACCESS_TOKEN = stringPreferencesKey("access_token")
    }
}

class InMemoryTokenStore(initialToken: String? = null) : TokenStore {
    private val token = MutableStateFlow(initialToken)

    override suspend fun getAccessToken(): String? = token.value

    override fun currentAccessToken(): String? = token.value

    override suspend fun saveAccessToken(token: String) {
        this.token.value = token
    }

    override suspend fun clearAccessToken() {
        token.value = null
    }
}
