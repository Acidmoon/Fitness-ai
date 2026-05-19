package com.fitnessai.android.ui.auth

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class RegisterValidatorTest {
    @Test
    fun validFormHasNoErrors() {
        val errors = RegisterValidator.validate(
            RegisterFormState(
                username = "student01",
                password = "password123",
                confirmPassword = "password123",
                email = "student@example.com"
            )
        )

        assertFalse(errors.hasErrors)
    }

    @Test
    fun invalidFormReportsAllFieldErrors() {
        val errors = RegisterValidator.validate(
            RegisterFormState(
                username = "ab",
                password = "short",
                confirmPassword = "different",
                email = "not-email"
            )
        )

        assertTrue(errors.username != null)
        assertTrue(errors.password != null)
        assertTrue(errors.confirmPassword != null)
        assertTrue(errors.email != null)
    }
}
