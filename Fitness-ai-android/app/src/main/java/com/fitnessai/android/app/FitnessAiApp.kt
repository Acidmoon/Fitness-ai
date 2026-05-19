package com.fitnessai.android.app

import androidx.compose.animation.AnimatedContentTransitionScope
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.BarChart
import androidx.compose.material.icons.outlined.FitnessCenter
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SnackbarResult
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.fitnessai.android.core.network.LocalNetworkMonitor
import com.fitnessai.android.core.session.LocalSessionManager
import com.fitnessai.android.core.session.SessionEvent
import com.fitnessai.android.core.snackbar.LocalSnackbarController
import com.fitnessai.android.ui.about.AboutScreen
import com.fitnessai.android.ui.auth.LoginScreen
import com.fitnessai.android.ui.auth.LoginViewModel
import com.fitnessai.android.ui.auth.RegisterScreen
import com.fitnessai.android.ui.auth.RegisterViewModel
import com.fitnessai.android.ui.auth.RoleSelectionScreen
import com.fitnessai.android.ui.components.NetworkBanner
import com.fitnessai.android.ui.home.HomeScreen
import com.fitnessai.android.ui.profile.ProfileScreen
import com.fitnessai.android.ui.settings.LocalReducedMotion
import com.fitnessai.android.ui.settings.SettingsScreen
import com.fitnessai.android.ui.settings.SettingsViewModel
import com.fitnessai.android.ui.stats.StatsScreen
import com.fitnessai.android.ui.stats.StatsViewModel
import com.fitnessai.android.ui.training.RecordDetailScreen
import com.fitnessai.android.ui.training.RecordEditorScreen
import com.fitnessai.android.ui.training.TrainingListScreen
import com.fitnessai.android.ui.video.VideoRecorderScreen
import com.fitnessai.android.data.repository.ApiStatsRepository

private object Routes {
    const val Login = "auth/login"
    const val Register = "auth/register"
    const val RoleSelection = "auth/role"
    const val Home = "home"
    const val Training = "training"
    const val CreateRecord = "training/create"
    const val RecordDetail = "training/{recordId}"
    const val RecordCamera = "training/{recordId}/camera"
    const val Stats = "stats"
    const val Profile = "profile"
    const val Settings = "main/settings"
    const val About = "main/about"
}

private data class TabItem(
    val route: String,
    val label: String,
    val icon: @Composable () -> Unit
)

private val tabs = listOf(
    TabItem(Routes.Home, "首页") { Icon(Icons.Outlined.Home, contentDescription = null) },
    TabItem(Routes.Training, "训练") { Icon(Icons.Outlined.FitnessCenter, contentDescription = null) },
    TabItem(Routes.Stats, "统计") { Icon(Icons.Outlined.BarChart, contentDescription = null) },
    TabItem(Routes.Profile, "我的") { Icon(Icons.Outlined.Person, contentDescription = null) }
)

@Composable
fun FitnessAiApp(viewModel: FitnessAiViewModel) {
    val sessionManager = checkNotNull(LocalSessionManager.current) {
        "FitnessAiApp requires SessionManager via CompositionLocal"
    }
    val snackbar = LocalSnackbarController.current
    val hostState = remember { SnackbarHostState() }

    LaunchedEffect(snackbar) {
        for (message in snackbar.messages) {
            val result = hostState.showSnackbar(
                message = message.text,
                actionLabel = message.actionLabel
            )
            if (result == SnackbarResult.ActionPerformed) {
                message.onAction?.invoke()
            }
        }
    }

    val session by viewModel.session.collectAsStateWithLifecycle()
    val navController = rememberNavController()

    LaunchedEffect(sessionManager, navController) {
        sessionManager.events.collect { event ->
            if (event is SessionEvent.NavigateToLogin) {
                navController.popUpToLogin()
                if (event.reason == SessionEvent.Reason.Unauthorized) {
                    snackbar.warning("登录已失效，请重新登录")
                }
            }
        }
    }

    Scaffold(
        topBar = { NetworkBanner() },
        snackbarHost = { SnackbarHost(hostState) },
        containerColor = MaterialTheme.colorScheme.background
    ) { padding ->
        Box(Modifier.padding(padding)) {
            FitnessAiNavGraph(
                navController = navController,
                viewModel = viewModel,
                authenticated = session != null,
                roleSelected = session?.role != null
            )
        }
    }
}

@Composable
private fun FitnessAiNavGraph(
    navController: NavHostController,
    viewModel: FitnessAiViewModel,
    authenticated: Boolean,
    roleSelected: Boolean
) {
    val startDestination = when {
        !authenticated -> Routes.Login
        !roleSelected -> Routes.RoleSelection
        else -> Routes.Home
    }
    val reducedMotion = LocalReducedMotion.current

    NavHost(
        navController = navController,
        startDestination = startDestination,
        enterTransition = if (reducedMotion) {
            { fadeIn(tween(0)) }
        } else {
            { slideIntoContainer(AnimatedContentTransitionScope.SlideDirection.Left, tween(220)) + fadeIn(tween(220)) }
        },
        exitTransition = if (reducedMotion) {
            { fadeOut(tween(0)) }
        } else {
            { slideOutOfContainer(AnimatedContentTransitionScope.SlideDirection.Left, tween(220)) + fadeOut(tween(220)) }
        },
        popEnterTransition = if (reducedMotion) {
            { fadeIn(tween(0)) }
        } else {
            { slideIntoContainer(AnimatedContentTransitionScope.SlideDirection.Right, tween(220)) + fadeIn(tween(220)) }
        },
        popExitTransition = if (reducedMotion) {
            { fadeOut(tween(0)) }
        } else {
            { slideOutOfContainer(AnimatedContentTransitionScope.SlideDirection.Right, tween(220)) + fadeOut(tween(220)) }
        }
    ) {
        composable(Routes.Login) { backstackEntry ->
            val container = currentAppContainer()
            val loginViewModel: LoginViewModel = viewModel(
                viewModelStoreOwner = backstackEntry,
                factory = LoginViewModel.Factory(
                    authRepository = container.repositories.authRepository,
                    sessionManager = container.sessionManager,
                    snackbar = container.snackbarController
                )
            )
            LoginScreen(
                viewModel = loginViewModel,
                onLoggedIn = {
                    viewModel.onLoggedIn()
                    navController.navigate(Routes.Home) {
                        popUpTo(Routes.Login) { inclusive = true }
                        launchSingleTop = true
                    }
                },
                onRegister = { navController.navigate(Routes.Register) }
            )
        }
        composable(Routes.Register) { backstackEntry ->
            val container = currentAppContainer()
            val registerViewModel: RegisterViewModel = viewModel(
                viewModelStoreOwner = backstackEntry,
                factory = RegisterViewModel.Factory(
                    authRepository = container.repositories.authRepository,
                    sessionManager = container.sessionManager
                )
            )
            RegisterScreen(
                viewModel = registerViewModel,
                onRegistered = {
                    viewModel.onLoggedIn()
                    navController.navigate(Routes.Home) {
                        popUpTo(Routes.Login) { inclusive = true }
                        launchSingleTop = true
                    }
                },
                onBackToLogin = { navController.popBackStack() }
            )
        }
        composable(Routes.RoleSelection) {
            RoleSelectionScreen(onRoleSelected = viewModel::selectRole)
        }
        composable(Routes.RecordCamera, arguments = listOf(navArgument("recordId") { type = NavType.StringType })) { entry ->
            val recordId = entry.arguments?.getString("recordId").orEmpty()
            VideoRecorderScreen(
                onVideoSaved = { uri ->
                    viewModel.attachVideo(recordId, uri)
                    navController.popBackStack()
                },
                onClose = { navController.popBackStack() }
            )
        }
        composable(Routes.Home) {
            MainShell(navController = navController) {
                val state by viewModel.homeState.collectAsStateWithLifecycle()
                HomeScreen(
                    state = state,
                    onRetry = viewModel::refreshHome,
                    onRefresh = viewModel::refreshHome,
                    onOpenTraining = { navController.navigateTab(Routes.Training) },
                    onOpenRecord = { id -> navController.navigate("training/$id") }
                )
            }
        }
        composable(Routes.Training) {
            MainShell(navController = navController) {
                val records by viewModel.records.collectAsStateWithLifecycle()
                val operation by viewModel.recordsOperation.collectAsStateWithLifecycle()
                TrainingListScreen(
                    records = records,
                    operation = operation,
                    onRetry = viewModel::refreshRecords,
                    onRefresh = viewModel::refreshRecords,
                    onCreate = { navController.navigate(Routes.CreateRecord) },
                    onOpenRecord = { id -> navController.navigate("training/$id") }
                )
            }
        }
        composable(Routes.CreateRecord) {
            val exercises by viewModel.exerciseCatalog.collectAsStateWithLifecycle()
            val actionState by viewModel.recordActionState.collectAsStateWithLifecycle()
            RecordEditorScreen(
                title = "新建训练",
                initial = null,
                apiMode = true,
                exerciseOptions = exercises,
                saving = actionState.saving,
                onBack = { navController.popBackStack() },
                onSave = { draft, onResult ->
                    viewModel.createRecord(draft) { id, error ->
                        if (id != null) {
                            navController.navigate("training/$id") {
                                popUpTo(Routes.Training)
                            }
                        }
                        onResult(id != null, error)
                    }
                }
            )
        }
        composable(Routes.RecordDetail, arguments = listOf(navArgument("recordId") { type = NavType.StringType })) { entry ->
            val recordId = entry.arguments?.getString("recordId").orEmpty()
            val records by viewModel.records.collectAsStateWithLifecycle()
            val operation by viewModel.recordsOperation.collectAsStateWithLifecycle()
            val actionState by viewModel.recordActionState.collectAsStateWithLifecycle()
            val exercises by viewModel.exerciseCatalog.collectAsStateWithLifecycle()
            RecordDetailScreen(
                record = records.firstOrNull { it.id == recordId },
                operation = operation,
                actionState = actionState,
                apiMode = true,
                exerciseOptions = exercises,
                onBack = { navController.popBackStack() },
                onRetryLoad = viewModel::refreshRecords,
                onClearActionError = viewModel::clearRecordActionError,
                onSave = { draft, onResult -> viewModel.updateRecord(recordId, draft, onResult) },
                onDelete = {
                    viewModel.deleteRecord(recordId) { success, _ ->
                        if (success) navController.popBackStack()
                    }
                },
                onPickVideo = { uri -> viewModel.attachVideo(recordId, uri) },
                onRecordVideo = { navController.navigate("training/$recordId/camera") },
                onStartAnalysis = { onResult -> viewModel.startAnalysis(recordId, onResult) },
                onScorePose = { apply, onResult -> viewModel.scorePose(recordId, apply, onResult) }
            )
        }
        composable(Routes.Stats) {
            MainShell(navController = navController) {
                val container = currentAppContainer()
                val statsViewModel: StatsViewModel = viewModel(
                    factory = StatsViewModel.Factory(
                        statsRepository = container.repositories.statsRepository as ApiStatsRepository,
                        recordRepository = container.repositories.recordRepository
                    )
                )
                LaunchedEffect(statsViewModel) {
                    statsViewModel.refreshAll()
                }
                val operation by viewModel.statsOperation.collectAsStateWithLifecycle()
                StatsScreen(
                    viewModel = statsViewModel,
                    operation = operation,
                    onRetry = viewModel::refreshStats,
                    onRefresh = {
                        viewModel.refreshStats()
                        statsViewModel.refreshAll()
                    }
                )
            }
        }
        composable(Routes.Profile) {
            MainShell(navController = navController) {
                val session by viewModel.session.collectAsStateWithLifecycle()
                ProfileScreen(
                    session = session,
                    onSettings = { navController.navigate(Routes.Settings) },
                    onAbout = { navController.navigate(Routes.About) },
                    onLogout = { viewModel.logout() }
                )
            }
        }
        composable(Routes.Settings) {
            val container = currentAppContainer()
            val settingsViewModel: SettingsViewModel = viewModel(
                factory = SettingsViewModel.Factory(
                    themeManager = container.themeManager,
                    runtimeConfigStore = container.runtimeConfigStore,
                    apiClientHolder = container.apiClientHolder,
                    cacheCleaner = container.cacheCleaner,
                    sessionManager = container.sessionManager,
                    snackbar = container.snackbarController,
                    reducedMotionStore = container.reducedMotionStore
                )
            )
            SettingsScreen(
                viewModel = settingsViewModel,
                onBack = { navController.popBackStack() },
                onAbout = { navController.navigate(Routes.About) }
            )
        }
        composable(Routes.About) {
            AboutScreen(onBack = { navController.popBackStack() })
        }
    }
}

@Composable
private fun MainShell(
    navController: NavHostController,
    content: @Composable () -> Unit
) {
    val backStack by navController.currentBackStackEntryAsState()
    val currentRoute = backStack?.destination?.route
    Scaffold(
        bottomBar = {
            NavigationBar {
                tabs.forEach { tab ->
                    NavigationBarItem(
                        selected = currentRoute == tab.route,
                        onClick = { navController.navigateTab(tab.route) },
                        icon = tab.icon,
                        label = { Text(tab.label) }
                    )
                }
            }
        },
        content = { padding -> Box(Modifier.padding(padding)) { content() } }
    )
}

@Composable
private fun currentAppContainer(): AppContainer {
    val context = androidx.compose.ui.platform.LocalContext.current
    return (context.applicationContext as FitnessAiApplication).container
}

private fun NavHostController.navigateTab(route: String) {
    navigate(route) {
        popUpTo(Routes.Home) { saveState = true }
        launchSingleTop = true
        restoreState = true
    }
}

private fun NavHostController.popUpToLogin() {
    if (currentDestination?.route == Routes.Login) return
    navigate(Routes.Login) {
        popUpTo(graph.startDestinationId) { inclusive = true }
        launchSingleTop = true
    }
}
