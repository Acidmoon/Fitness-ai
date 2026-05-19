package com.fitnessai.android.core.config

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class RuntimeConfigTest {
    @Test
    fun baseUrlRegexAcceptsHttpUrlsEndingWithSlash() {
        assertTrue(RuntimeConfig.BASE_URL_REGEX.matches("http://10.0.2.2:8000/"))
        assertTrue(RuntimeConfig.BASE_URL_REGEX.matches("https://api.example.com/"))
    }

    @Test
    fun baseUrlRegexRejectsWhitespaceMissingSchemeOrMissingSlash() {
        assertFalse(RuntimeConfig.BASE_URL_REGEX.matches("api.example.com/"))
        assertFalse(RuntimeConfig.BASE_URL_REGEX.matches("https://api.example.com"))
        assertFalse(RuntimeConfig.BASE_URL_REGEX.matches("https://api.example.com/a b/"))
    }
}
