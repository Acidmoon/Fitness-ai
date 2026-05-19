package com.fitnessai.android.ui.components

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.fitnessai.android.core.network.LocalNetworkMonitor
import com.fitnessai.android.core.snackbar.LocalSnackbarController

/**
 * Standard pull-to-refresh wrapper. When the user is offline we don't actually call
 * [onRefresh] because the request would fail; we surface a snackbar hinting that local
 * cache is shown instead. Online status is read from [LocalNetworkMonitor] so the
 * behaviour stays consistent across screens.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AppPullToRefreshBox(
    isRefreshing: Boolean,
    onRefresh: () -> Unit,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit
) {
    val online by LocalNetworkMonitor.current.isOnline.collectAsStateWithLifecycle()
    val snackbar = LocalSnackbarController.current
    PullToRefreshBox(
        isRefreshing = isRefreshing,
        onRefresh = {
            if (online) {
                onRefresh()
            } else {
                snackbar.warning("当前无网络连接，已加载本地缓存")
            }
        },
        modifier = modifier
    ) {
        Box(modifier = Modifier.fillMaxSize()) {
            content()
        }
    }
}
