package com.fitnessai.android.app

import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.BarChart
import androidx.compose.material.icons.outlined.FitnessCenter
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.fitnessai.android.ui.auth.LoginScreen
import com.fitnessai.android.ui.auth.RoleSelectionScreen
import com.fitnessai.android.ui.home.HomeScreen
import com.fitnessai.android.ui.profile.ProfileScreen
import com.fitnessai.android.ui.stats.StatsScreen
import com.fitnessai.android.ui.training.RecordDetailScreen
import com.fitnessai.android.ui.training.RecordEditorScreen
import com.fitnessai.android.ui.training.TrainingListScreen
import com.fitnessai.android.ui.video.VideoRecorderScreen

private object Routes {
    const val Home = "home"
    const val Training = "training"
    const val CreateRecord = "training/create"
    const val RecordDetail = "training/{recordId}"
    const val RecordCamera = "training/{recordId}/camera"
    const val Stats = "stats"
    const val Profile = "profile"
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
    val session by viewModel.session.collectAsStateWithLifecycle()

    if (session == null) {
        LoginScreen(
            onLogin = { username, password, onResult ->
                viewModel.login(username, password, onResult)
            }
        )
        return
    }

    if (session?.role == null) {
        RoleSelectionScreen(onRoleSelected = viewModel::selectRole)
        return
    }

    AuthenticatedApp(viewModel = viewModel, session = session)
}

@Composable
private fun AuthenticatedApp(viewModel: FitnessAiViewModel, session: com.fitnessai.android.data.model.UserSession?) {
    val navController = rememberNavController()

    NavHost(
        navController = navController,
        startDestination = Routes.Home
    ) {
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
                    onCreate = { navController.navigate(Routes.CreateRecord) },
                    onOpenRecord = { id -> navController.navigate("training/$id") }
                )
            }
        }
        composable(Routes.CreateRecord) {
            RecordEditorScreen(
                title = "新建训练",
                initial = null,
                onBack = { navController.popBackStack() },
                onSave = { draft ->
                    val id = viewModel.createRecord(draft)
                    if (id != null) {
                        navController.navigate("training/$id") {
                            popUpTo(Routes.Training)
                        }
                    }
                    id != null
                }
            )
        }
        composable(Routes.RecordDetail, arguments = listOf(navArgument("recordId") { type = NavType.StringType })) { entry ->
            val recordId = entry.arguments?.getString("recordId").orEmpty()
            val records by viewModel.records.collectAsStateWithLifecycle()
            val operation by viewModel.recordsOperation.collectAsStateWithLifecycle()
            val actionState by viewModel.recordActionState.collectAsStateWithLifecycle()
            RecordDetailScreen(
                record = records.firstOrNull { it.id == recordId },
                operation = operation,
                actionState = actionState,
                onBack = { navController.popBackStack() },
                onRetryLoad = viewModel::refreshRecords,
                onClearActionError = viewModel::clearRecordActionError,
                onSave = { draft -> viewModel.updateRecord(recordId, draft) },
                onDelete = {
                    viewModel.deleteRecord(recordId)
                    navController.popBackStack()
                },
                onPickVideo = { uri -> viewModel.attachVideo(recordId, uri) },
                onRecordVideo = { navController.navigate("training/$recordId/camera") },
                onStartAnalysis = { onResult -> viewModel.startAnalysis(recordId, onResult) }
            )
        }
        composable(Routes.Stats) {
            MainShell(navController = navController) {
                val stats by viewModel.stats.collectAsStateWithLifecycle()
                val operation by viewModel.statsOperation.collectAsStateWithLifecycle()
                StatsScreen(stats = stats, operation = operation, onRetry = viewModel::refreshStats)
            }
        }
        composable(Routes.Profile) {
            MainShell(navController = navController) {
                ProfileScreen(
                    session = session,
                    onLogout = {
                        viewModel.logout()
                    }
                )
            }
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
        content = { padding -> androidx.compose.foundation.layout.Box(Modifier.padding(padding)) { content() } }
    )
}

private fun NavHostController.navigateTab(route: String) {
    navigate(route) {
        popUpTo(Routes.Home) {
            saveState = true
        }
        launchSingleTop = true
        restoreState = true
    }
}
