package com.fitnessai.android.ui.auth

data class RegisterFormState(
    val username: String = "",
    val password: String = "",
    val confirmPassword: String = "",
    val email: String = ""
)

data class RegisterFormErrors(
    val username: String? = null,
    val password: String? = null,
    val confirmPassword: String? = null,
    val email: String? = null
) {
    val hasErrors: Boolean
        get() = username != null || password != null || confirmPassword != null || email != null
}

object RegisterValidator {
    private val emailRegex = Regex("""^[A-Za-z0-9+_.-]+@[A-Za-z0-9.-]+$""")

    fun validate(state: RegisterFormState): RegisterFormErrors {
        val username = state.username.trim()
        val email = state.email.trim()
        return RegisterFormErrors(
            username = if (username.length !in 3..32) "用户名长度需为 3 到 32 个字符" else null,
            password = if (state.password.length < 8) "密码长度至少 8 个字符" else null,
            confirmPassword = if (state.confirmPassword != state.password) "两次输入的密码不一致" else null,
            email = if (email.isNotEmpty() && !emailRegex.matches(email)) "邮箱格式不正确" else null
        )
    }
}
